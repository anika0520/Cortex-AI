"""
Cortex Backend — main.py
────────────────────────────────────────────────────────────────────────────────
FastAPI autonomous agent:
  Playwright scraping → file download → Whisper transcription →
  Python code generation (Groq or AIPipe) → sandboxed execution →
  retry loop → challenge submission

Run:
  Development:  python main.py --dev
  Production:   python main.py
────────────────────────────────────────────────────────────────────────────────
"""

import argparse, logging, os, sys, re, json, time, asyncio, subprocess, tempfile, atexit
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import httpx, uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if os.getenv("CORTEX_DEBUG") else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("cortex")

# ── Config ────────────────────────────────────────────────────────────────────

EXPECTED_EMAIL  = os.getenv("EXPECTED_EMAIL", "")
MY_SECRET       = os.getenv("MY_SECRET", "")
GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
AIPIPE_API_KEY  = os.getenv("AIPIPE_API_KEY", "")
AIPIPE_BASE_URL = os.getenv("AIPIPE_BASE_URL", "https://aipipe.org/openai/v1")

# Determine LLM provider — Groq preferred (free, fast)
def get_llm_config() -> tuple[str, str, str]:
    """Returns (base_url, api_key, model)"""
    if GROQ_API_KEY:
        log.info("LLM provider: Groq (llama-3.3-70b-versatile)")
        return "https://api.groq.com/openai/v1", GROQ_API_KEY, "llama-3.3-70b-versatile"
    if AIPIPE_API_KEY:
        log.info("LLM provider: AIPipe (gpt-4o-mini)")
        return AIPIPE_BASE_URL.rstrip("/"), AIPIPE_API_KEY, "gpt-4o-mini"
    raise RuntimeError(
        "No LLM key found. Set GROQ_API_KEY (free: console.groq.com) "
        "or AIPIPE_API_KEY in your .env file."
    )

# ── CORS (tighten in production) ──────────────────────────────────────────────

# Render / Vercel: set CORS_ORIGINS to comma-separated frontend URLs.
# e.g.: https://cortex-xyz.vercel.app,https://yourdomain.com
# Strip whitespace so accidental spaces don't silently break CORS.
_raw_origins    = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── Temp file registry (for safe cleanup) ────────────────────────────────────

_temp_files: list[str] = []

def register_temp(path: str) -> str:
    _temp_files.append(path)
    return path

def cleanup_temp(*paths: str) -> None:
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
                log.debug("Cleaned up temp: %s", p)
                if p in _temp_files:
                    _temp_files.remove(p)
        except Exception as e:
            log.warning("Failed to remove temp %s: %s", p, e)

@atexit.register
def _cleanup_all_temps():
    for p in list(_temp_files):
        cleanup_temp(p)

# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Cortex backend starting…")
    try:
        get_llm_config()
    except RuntimeError as e:
        log.warning("⚠  %s", e)
    yield
    log.info("Cortex backend shutting down — cleaning up %d temp files", len(_temp_files))
    _cleanup_all_temps()

app = FastAPI(title="Cortex Agent Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.exception_handler(RequestValidationError)
async def validation_handler(req: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"detail": "Invalid JSON or missing required fields."})

# ── Models ────────────────────────────────────────────────────────────────────

class Payload(BaseModel):
    email: str
    secret: str
    url: str

# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    provider_ok = bool(GROQ_API_KEY or AIPIPE_API_KEY)
    return {
        "status": "ok",
        "version": "2.0.0",
        "llm": "groq" if GROQ_API_KEY else ("aipipe" if AIPIPE_API_KEY else "none"),
        "whisper": _has_whisper(),
        "playwright": _has_playwright(),
        "provider_configured": provider_ok,
    }

def _has_whisper() -> bool:
    try: import whisper; return True
    except ImportError: return False

def _has_playwright() -> bool:
    try: import playwright; return True
    except ImportError: return False

# ── Utilities ──────────────────────────────────────────────────────────────────

def make_abs_url(base: str, path: str) -> str:
    if path.startswith(("http://", "https://")):
        return path
    parsed = urlparse(base)
    root   = f"{parsed.scheme}://{parsed.netloc}"
    return f"{root}{path}" if path.startswith("/") else f"{root}/{path}"

def check_ffmpeg() -> bool:
    try:
        r = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        return r.returncode == 0
    except Exception:
        return False

def convert_to_wav(src: str, dst: str) -> bool:
    try:
        r = subprocess.run(
            ["ffmpeg", "-i", src, "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y", dst],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
        )
        return r.returncode == 0
    except Exception as e:
        log.error("ffmpeg convert error: %s", e)
        return False

# ── Whisper transcription ──────────────────────────────────────────────────────

def transcribe_audio(path: str, retries: int = 3) -> str | None:
    if not check_ffmpeg():
        log.warning("ffmpeg not found — skipping transcription")
        return None

    work_path = path
    wav_path: str | None = None

    ext = os.path.splitext(path)[1].lower()
    if ext != ".wav":
        wav_path = path.rsplit(".", 1)[0] + "_conv.wav"
        register_temp(wav_path)
        if convert_to_wav(path, wav_path):
            log.info("Audio converted to WAV: %s", wav_path)
            work_path = wav_path
        else:
            log.warning("WAV conversion failed — using original")

    for attempt in range(1, retries + 1):
        try:
            import whisper
            log.info("Whisper attempt %d/%d: %s (%d bytes)", attempt, retries, work_path, os.path.getsize(work_path))
            model  = whisper.load_model("base")
            result = model.transcribe(work_path)
            text   = result["text"].strip()
            log.info("Transcription OK (%d chars)", len(text))
            return text
        except ImportError:
            log.error("whisper not installed — pip install openai-whisper")
            return None
        except Exception as e:
            log.warning("Transcription attempt %d failed: %s", attempt, e)
            time.sleep(1.5)

    return None

# ── Pip auto-install ───────────────────────────────────────────────────────────

async def install_pkg(name: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "pip", "install", name,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        ok = proc.returncode == 0
        if ok:
            log.info("pip install %s: OK", name)
        else:
            log.warning("pip install %s failed: %s", name, stderr.decode()[:200])
        return ok
    except Exception as e:
        log.error("install_pkg: %s", e)
        return False

# ── Sandboxed code execution ───────────────────────────────────────────────────

async def run_code(code: str, timeout: int = 30) -> tuple[bool, str]:
    fd, tmp = tempfile.mkstemp(suffix=".py")
    register_temp(tmp)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(code)
        proc = await asyncio.create_subprocess_exec(
            sys.executable, tmp,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        out = stdout.decode().strip()
        err = stderr.decode().strip()

        if proc.returncode != 0:
            log.debug("Code stderr: %s", err[:300])
            m = re.search(r"No module named '([^']+)'", err)
            if m and await install_pkg(m.group(1)):
                cleanup_temp(tmp)
                return await run_code(code, timeout)
            return False, f"Error: {err}"

        log.info("Code executed OK → %s", out[:80])
        return True, out

    except asyncio.TimeoutError:
        log.warning("Code execution timed out (%ds)", timeout)
        return False, "Execution timed out"
    except Exception as e:
        log.error("run_code: %s", e)
        return False, str(e)
    finally:
        cleanup_temp(tmp)

# ── File download ──────────────────────────────────────────────────────────────

async def download_file(url: str, client: httpx.AsyncClient, timeout: int = 20) -> str | None:
    try:
        log.info("Downloading: %s", url)
        res = await client.get(url, timeout=timeout)
        res.raise_for_status()
        ext = os.path.splitext(url.split("?")[0])[1] or ".tmp"
        fd, path = tempfile.mkstemp(suffix=ext)
        with os.fdopen(fd, "wb") as f:
            f.write(res.content)
        register_temp(path)
        log.info("Downloaded %d bytes → %s", len(res.content), path)
        return path
    except Exception as e:
        log.warning("Download failed %s: %s", url, e)
        return None

# ── LLM call ──────────────────────────────────────────────────────────────────

async def llm_call(
    msgs: list[dict],
    client: httpx.AsyncClient,
    deadline: float,
    json_mode: bool = False,
) -> dict | str:
    base_url, api_key, model = get_llm_config()
    remaining = max(10.0, deadline - time.time())

    body: dict = {
        "model": model,
        "messages": msgs,
        **({"response_format": {"type": "json_object"}} if json_mode else {}),
    }

    log.debug("LLM call: model=%s json_mode=%s msgs=%d", model, json_mode, len(msgs))

    resp = await client.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=min(55.0, remaining),
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    log.debug("LLM response: %s…", str(content)[:120])
    return json.loads(content) if json_mode else content

# ── Code-generation agent ──────────────────────────────────────────────────────

async def coding_agent(
    task: str,
    audio: str | None,
    files: list[str],
    page_ctx: str,
    deadline: float,
    history: list[dict],
) -> str | None:
    file_info  = "\n".join(f"Local file: {p}" for p in files) if files else "No files"
    ctx_parts  = []
    if audio:
        ctx_parts.append(f"AUDIO TRANSCRIPTION (critical — use this):\n{audio}")
    if history:
        ctx_parts.append("PREVIOUS FAILED ATTEMPTS (learn from these):\n" + "\n".join(
            f"  Attempt {i+1}: answer={a['answer']}, reason={a.get('reason')}"
            for i, a in enumerate(history)
        ) + "\n\nCommon mistakes: wrong operator (> vs >=), wrong column, wrong aggregation.")
    if page_ctx:
        ctx_parts.append(f"PAGE CONTEXT:\n{page_ctx[:1500]}")
    ctx = "\n\n".join(ctx_parts) or "No additional context"

    msgs = [{"role": "system", "content": (
        f"You are a Python expert for data analysis.\n\n{ctx}\n\n"
        f"Task: {task}\nFiles:\n{file_info}\n\n"
        "Write complete working Python that prints ONLY the final numeric/text answer.\n"
        "Use ```python``` blocks. No explanations."
    )}]

    async with httpx.AsyncClient() as c:
        for attempt in range(1, 4):
            if time.time() >= deadline - 15:
                log.warning("coding_agent: deadline too close, stopping")
                break
            try:
                resp = await llm_call(msgs, c, deadline)
                m    = re.search(r"```python\n(.*?)```", str(resp), re.DOTALL) \
                    or re.search(r"```\n(.*?)```", str(resp), re.DOTALL)
                if m:
                    log.info("coding_agent attempt %d: executing code", attempt)
                    ok, out = await run_code(m.group(1), timeout=25)
                    if ok:
                        return out
                    log.warning("Code failed: %s", out[:200])
                    msgs += [
                        {"role": "assistant", "content": str(resp)},
                        {"role": "user",      "content": f"Execution error: {out}\nFix it."},
                    ]
                else:
                    msgs += [
                        {"role": "assistant", "content": str(resp)},
                        {"role": "user",      "content": "No ```python``` block found. Wrap code in ```python```."},
                    ]
            except Exception as e:
                log.error("coding_agent LLM error: %s", e)
                break
    return None

# ── Web scraper ────────────────────────────────────────────────────────────────

async def scrape_url(url: str, timeout_s: float) -> str:
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(timeout=int(timeout_s * 1000))
            page    = await browser.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=int(timeout_s * 1000))
                html = await page.content()
                log.info("Playwright scraped %s (%d chars)", url, len(html))
            except Exception as e:
                html = f"Playwright scrape failed: {e}"
                log.warning("Playwright error for %s: %s", url, e)
            finally:
                await browser.close()
        return html
    except ImportError:
        log.info("Playwright not installed — falling back to httpx for %s", url)
        try:
            async with httpx.AsyncClient(follow_redirects=True) as c:
                r = await c.get(url, timeout=min(timeout_s, 20))
                log.info("httpx fetched %s (%d chars)", url, len(r.text))
                return r.text
        except Exception as e:
            log.error("httpx scrape failed %s: %s", url, e)
            return f"Scrape failed: {e}"

# ── Main processing loop ───────────────────────────────────────────────────────

@app.post("/api")
async def process(payload: Payload):
    if payload.email != EXPECTED_EMAIL or payload.secret != MY_SECRET:
        log.warning("Auth failed: email=%s", payload.email)
        raise HTTPException(status_code=403, detail="Invalid credentials.")

    start    = time.time()
    deadline = start + 170  # 10 s safety buffer before uvicorn's timeout

    log.info("=== NEW TASK: %s ===", payload.url)

    # Scrape initial page
    scrape_t = max(10.0, deadline - time.time() - 10)
    html     = await scrape_url(payload.url, scrape_t)

    system_prompt = f"""You are an intelligent web-agent.

Email:  {payload.email}
Secret: {payload.secret}
URL:    {payload.url}

Determine if the page has a final answerable result or needs more work.

FORM A — answerable (return this when you have the answer + submission URL):
{{"email":"{payload.email}","secret":"{payload.secret}","url":"{payload.url}","submission_url":"<abs URL>","answer":"<value>","answerable":true}}

FORM B — needs work:
{{"answerable":false,"type":"Scraping"|"Operation","Required":["<url or path>"],"operation":["<task description>"]}}

Only return valid JSON."""

    msgs = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": html[:80000]},
    ]

    async with httpx.AsyncClient() as client:
        result       = await llm_call(msgs, client, deadline, json_mode=True)
        local_files  : list[str] = []
        audio_text   : str | None = None
        audio_tmp    : str | None = None
        downloaded   : set[str]  = set()
        attempt_hist : list[dict] = []
        last_result  : str | None = None
        page_ctx     = html[:4000]

        AUDIO_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".opus"}
        DATA_EXT  = {".csv", ".txt", ".json", ".xlsx", ".xls", ".pdf", ".jpg", ".jpeg", ".png", ".gif"}

        for iteration in range(1, 11):
            if time.time() >= deadline - 8:
                log.info("Deadline approaching — forcing submission")
                break

            if result.get("answerable"):
                log.info("Answerable: %s", result.get("answer"))
                break

            log.info("Iteration %d — type=%s remaining=%.0fs", iteration, result.get("type"), deadline - time.time())
            required = result.get("Required", [])
            aux      = ""

            audio_items = [u for u in required if any(u.lower().split("?")[0].endswith(e) for e in AUDIO_EXT)]
            data_items  = [u for u in required if any(u.lower().split("?")[0].endswith(e) for e in DATA_EXT)]

            # Download & transcribe audio
            for item in audio_items:
                if time.time() >= deadline - 25 or audio_text:
                    break
                full = make_abs_url(payload.url, item)
                if full in downloaded:
                    continue
                downloaded.add(full)
                try:
                    r = await client.get(full, timeout=15)
                    r.raise_for_status()
                    ext = os.path.splitext(full)[1] or ".opus"
                    fd, audio_tmp = tempfile.mkstemp(suffix=ext)
                    with os.fdopen(fd, "wb") as f:
                        f.write(r.content)
                    register_temp(audio_tmp)
                    log.info("Audio saved (%d bytes) → %s", len(r.content), audio_tmp)
                    audio_text = await asyncio.to_thread(transcribe_audio, audio_tmp)
                    if audio_text:
                        log.info("Transcription: %s…", audio_text[:80])
                    else:
                        log.warning("Transcription produced no text")
                except Exception as e:
                    log.error("Audio download error: %s", e)

            # Download data files
            for item in data_items:
                if time.time() >= deadline - 20:
                    break
                full = make_abs_url(payload.url, item)
                if full in downloaded:
                    continue
                downloaded.add(full)
                path = await download_file(full, client, timeout=15)
                if path:
                    local_files.append(path)

            # Run coding task
            if result.get("operation") and (local_files or audio_text):
                op = result["operation"][0]
                log.info("Starting coding agent: %s…", op[:80])
                code_result = await coding_agent(op, audio_text, local_files, page_ctx, deadline, attempt_hist)
                if code_result:
                    aux         = code_result
                    last_result = code_result
                else:
                    log.warning("Coding agent returned no result")

            # Scrape next page
            elif result.get("type") == "Scraping" and required and not audio_items and not data_items:
                full = make_abs_url(payload.url, required[0])
                if time.time() < deadline - 15:
                    aux = await scrape_url(full, min(15, deadline - time.time() - 5))

            if time.time() >= deadline - 8:
                break

            msgs.append({"role": "assistant", "content": json.dumps(result)})
            msgs.append({"role": "user",      "content": f"Step done. Output:\n{str(aux)[:40000]}"})
            log.info("Re-querying LLM with new context (%d chars)", len(str(aux)))
            result = await llm_call(msgs, client, deadline, json_mode=True)

        # Force answerable if time is up
        if not result.get("answerable"):
            log.info("Forcing submission with best available answer: %s", last_result)
            result.update({
                "answerable": True,
                "email": payload.email, "secret": payload.secret, "url": payload.url,
                "answer": last_result or "Unable to compute within time limit",
            })
            if not result.get("submission_url"):
                result["submission_url"] = "https://tds-llm-analysis.s-anand.net/submit"

        result.update({"email": payload.email, "secret": payload.secret, "url": payload.url})

        # Submit + retry loop
        for sub_attempt in range(1, 6):
            if not result.get("submission_url") or time.time() >= deadline:
                break

            log.info("Submission %d/5: answer=%s", sub_attempt, result.get("answer"))
            try:
                sub_res  = await client.post(result["submission_url"], json=result, timeout=max(5.0, deadline - time.time()))
                sub_res.raise_for_status()
                received = sub_res.json()

                if received.get("correct"):
                    log.info("✓ SUBMISSION ACCEPTED")
                    # Iterative chain handling — avoids recursive stack overflow (max 5 hops)
                    next_url = received.get("url")
                    for _hop in range(5):
                        if not next_url or time.time() >= deadline:
                            break
                        log.info("Chaining to next challenge: %s", next_url)
                        hop_html = await scrape_url(next_url, max(10.0, deadline - time.time() - 10))
                        hop_msgs = [
                            {"role": "system", "content": system_prompt},
                            {"role": "user",   "content": hop_html[:80000]},
                        ]
                        hop_result = await llm_call(hop_msgs, client, deadline, json_mode=True)
                        hop_result.update({"email": payload.email, "secret": payload.secret, "url": next_url})
                        if hop_result.get("answerable") and hop_result.get("submission_url"):
                            hop_sub  = await client.post(hop_result["submission_url"], json=hop_result, timeout=max(5.0, deadline - time.time()))
                            hop_sub.raise_for_status()
                            hop_recv = hop_sub.json()
                            if hop_recv.get("correct"):
                                log.info("✓ CHAIN HOP %d ACCEPTED", _hop + 1)
                                next_url = hop_recv.get("url")
                                result.update(hop_result)
                            else:
                                log.warning("✗ CHAIN HOP %d REJECTED", _hop + 1)
                                next_url = None
                        else:
                            break
                    result["final_completion"] = True
                    break

                reason = received.get("reason", "unknown")
                log.warning("✗ SUBMISSION REJECTED: %s", reason)
                attempt_hist.append({"answer": result.get("answer"), "result": "FAILED", "reason": reason})

                if sub_attempt >= 5 or time.time() >= deadline - 10:
                    result["submission_status"] = f"Failed: {reason}"
                    break

                msgs.append({"role": "assistant", "content": json.dumps(result)})
                msgs.append({"role": "user",      "content": f"WRONG ({reason}). Re-compute and return answerable=true."})
                result = await llm_call(msgs, client, deadline, json_mode=True)
                result.update({"email": payload.email, "secret": payload.secret, "url": payload.url, "answerable": True})
                if not result.get("submission_url"):
                    result["submission_url"] = sub_res.url

            except Exception as e:
                log.error("Submission error: %s", e)
                result["submission_status"] = f"Error: {e}"
                break

        # Cleanup
        cleanup_temp(*local_files, *(([audio_tmp] if audio_tmp else [])))

        log.info("=== TASK COMPLETE: answer=%s ===", result.get("answer"))
        return result

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dev",  action="store_true", help="Enable hot-reload (development)")
    # Render (and most PaaS) injects $PORT — CLI --port overrides it, 8000 is default.
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    log.info("Starting Cortex backend on %s:%d (reload=%s)", args.host, args.port, args.dev)
    log.info("Allowed CORS origins: %s", ALLOWED_ORIGINS)

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=args.dev,                          # Only hot-reload in dev
        workers=1 if args.dev else 2,             # Multi-worker in production
        log_level="debug" if os.getenv("CORTEX_DEBUG") else "info",
    )
