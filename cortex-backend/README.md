# Cortex Backend

FastAPI autonomous agent: Playwright → Whisper → Groq LLM → code execution → submission.

## Quick Start

```bash
# 1. Virtual environment
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate

# 2. Dependencies
pip install -r requirements.txt

# 3. Playwright browsers (for JS-rendered pages)
playwright install chromium

# 4. ffmpeg (for audio transcription)
# macOS:   brew install ffmpeg
# Ubuntu:  apt install ffmpeg
# Windows: choco install ffmpeg

# 5. Configure
cp .env.example .env
# Edit .env — set GROQ_API_KEY, EXPECTED_EMAIL, MY_SECRET

# 6a. Development (hot-reload)
python main.py --dev

# 6b. Production
python main.py
```

API available at http://localhost:8000
Docs at        http://localhost:8000/docs

## API

### GET /health
Returns status, LLM provider, and feature availability.

### POST /api
```json
{
  "email": "you@example.com",
  "secret": "your_secret",
  "url": "https://target-url.com"
}
```

## Notes
- Playwright is optional — falls back to httpx for non-JS pages
- Whisper is optional — audio tasks will be skipped if not installed
- Only `python main.py --dev` enables hot-reload (not production)
