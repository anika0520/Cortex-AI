# 🧠 Cortex — Autonomous AI Agent Platform

**A beautiful full-stack platform for building autonomous AI agents.**

Cortex can understand natural language tasks, plan steps, browse the web, download files, transcribe audio, generate and execute Python code, and submit answers — all with full visibility into every step.

It features a **dual-mode architecture**: powerful Python backend for real capabilities, with seamless fallback to in-browser Groq LLM when the backend is unavailable.

---

## ✨ Key Features

- **Dual-Mode Execution**: Full backend power or lightweight Groq LLM mode
- **Web Scraping** with Playwright (JavaScript-rendered pages supported)
- **File Handling**: Download, process, and analyze CSVs, PDFs, images, etc.
- **Audio Transcription** powered by Whisper (optional)
- **Intelligent Code Generation & Execution** with auto-dependency installation
- **Retry Logic & Challenge Chaining** — handles multi-step problems
- **Real-time Execution Timeline** with live logs
- **Persistent Task History** and Dashboard
- **Beautiful, responsive UI** built with modern React

---

## 📁 Project Structure

```bash
cortex-agent-platform/
├── README.md
├── docker-compose.yml                 # One-command Docker setup
│
├── agent-vision-hub/                  # React Frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── agent-engine.ts        # Dual-mode: Backend OR Groq LLM
│   │   │   ├── storage.ts             # Persistent localStorage layer
│   │   │   └── mock-data.ts
│   │   ├── components/
│   │   │   ├── ExecutionTimeline.tsx
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── TaskInput.tsx
│   │   │   └── TopBar.tsx
│   │   └── routes/
│   │       ├── index.tsx              # Main agent runner
│   │       ├── auth.tsx
│   │       ├── dashboard.tsx
│   │       └── files.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .env.example
│
└── cortex-backend/                    # Python Backend
    ├── main.py                        # Full agent pipeline
    ├── requirements.txt
    ├── Dockerfile
    └── .env.example

```

---

## ⚡ Quick Start

### Option 1 — Docker (Recommended)

```bash
# 1. Configure backend
cp cortex-backend/.env.example cortex-backend/.env
# Edit cortex-backend/.env:
#   GROQ_API_KEY=gsk_...
#   EXPECTED_EMAIL=you@example.com
#   MY_SECRET=your_secret

# 2. Configure frontend (optional — sets backend credentials)
cp agent-vision-hub/.env.example agent-vision-hub/.env
# Edit agent-vision-hub/.env:
#   VITE_GROQ_API_KEY=gsk_...
#   VITE_AGENT_EMAIL=you@example.com
#   VITE_AGENT_SECRET=your_secret

# 3. Launch everything
docker-compose up --build

# Frontend → http://localhost:3000
# Backend  → http://localhost:8000
# API Docs → http://localhost:8000/docs
```

---

### Option 2 — Local Development

**Terminal 1 — Backend:**

```bash
cd cortex-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
playwright install chromium        # For JS-rendered pages
# macOS/Linux: apt install ffmpeg  # For audio transcription
cp .env.example .env               # Fill in GROQ_API_KEY, credentials
python main.py --dev               # Hot-reload dev mode
```

**Terminal 2 — Frontend:**

```bash
cd agent-vision-hub
npm install
cp .env.example .env               # Fill in .env
npm run dev                        # → http://localhost:5173
```

---

### Option 3 — Frontend Only (Groq LLM, no backend)

```bash
cd agent-vision-hub
npm install
cp .env.example .env
# Set: VITE_GROQ_API_KEY=gsk_...  (free at console.groq.com)
npm run dev
```

---

## 🔄 How the Dual-Mode Engine Works

```
App starts
    │
    ▼
VITE_AGENT_EMAIL + _SECRET set?
    │
  ┌─┴──────────────────────────┐
  YES                          NO
  │                            │
  Ping /health                 Groq LLM mode
  │                            (in-browser)
  ├─ Reachable → Backend mode
  └─ Unreachable → Groq LLM mode (auto-fallback)
```

**UI badge shows:**

- 🟢 "Python backend connected" — full power (scraping, code exec, Whisper)
- 🔵 "Groq LLM mode" — in-browser Planner → Executor → Critic

---

🛠 Tech Stack
Frontend

React 19 + TypeScript
TanStack Router
Tailwind CSS + shadcn/ui
Framer Motion
Recharts

Backend

Python 3.11 + FastAPI
Groq (primary LLM)
Playwright (web scraping)
Whisper (optional audio transcription)
Sandboxed code execution with auto pip install

Infrastructure

Docker + Docker Compose
Nginx (for production frontend)

---

## 🔑 Environment Variables

### Frontend (`agent-vision-hub/.env`)

| Variable            | Required         | Purpose                          |
| ------------------- | ---------------- | -------------------------------- |
| `VITE_GROQ_API_KEY` | For LLM mode     | Free at console.groq.com         |
| `VITE_API_BASE_URL` | For backend mode | Default: `http://localhost:8000` |
| `VITE_AGENT_EMAIL`  | For backend mode | Must match `EXPECTED_EMAIL`      |
| `VITE_AGENT_SECRET` | For backend mode | Must match `MY_SECRET`           |

### Backend (`cortex-backend/.env`)

| Variable         | Required | Purpose                          |
| ---------------- | -------- | -------------------------------- |
| `GROQ_API_KEY`   | Yes      | Free Groq key (console.groq.com) |
| `EXPECTED_EMAIL` | Yes      | Auth credential                  |
| `MY_SECRET`      | Yes      | Auth credential                  |
| `CORS_ORIGINS`   | No       | Comma-separated allowed origins  |
| `CORTEX_DEBUG`   | No       | Enable verbose logging           |

---

## 🐍 Backend Capabilities

| Feature                           | Status                                  |
| --------------------------------- | --------------------------------------- |
| Web scraping (Playwright)         | ✅ Optional — falls back to httpx       |
| Audio transcription (Whisper)     | ✅ Optional — skipped if not installed  |
| Python code generation            | ✅ Groq llama-3.3-70b-versatile         |
| Sandboxed code execution          | ✅ subprocess with 30s timeout          |
| Auto pip-install missing packages | ✅                                      |
| Retry loop (code + submission)    | ✅ 3 code retries, 5 submission retries |
| Challenge chaining                | ✅ Follows `next_url` from grader       |
| Structured logging                | ✅ timestamps, levels, truncated output |
| Safe temp file cleanup            | ✅ `atexit` + per-request cleanup       |
| CORS security                     | ✅ Configurable allowed origins         |
| Dev vs production mode            | ✅ `--dev` flag for hot-reload          |

Built with transparency, reliability, and great developer experience in mind.
