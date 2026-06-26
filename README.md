# 🧠 Cortex: Autonomous AI Agent Platform

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)
![Python](https://img.shields.io/badge/Python-3.11+-yellow.svg)

Cortex is an advanced, full-stack platform designed for the development and deployment of autonomous AI agents. Built with a focus on reliability, transparency, and a premium developer experience, Cortex enables agents to seamlessly understand natural language, execute complex multi-step plans, interact with web environments, process diverse file types, and autonomously generate and execute Python code.

The platform employs a robust **dual-mode architecture**: a powerful Python backend for executing resource-intensive operations, with an intelligent and seamless fallback to an in-browser LLM engine when the backend is unreachable.

---

## 🌟 Core Capabilities

*   **Dual-Mode Execution Engine:** Seamlessly transitions between a high-performance Python backend and a lightweight, in-browser Groq LLM mode.
*   **Advanced Web Interaction:** Utilizes Playwright for robust web scraping, fully supporting JavaScript-rendered dynamic single-page applications.
*   **Comprehensive File Processing:** Natively handles the downloading, processing, and analysis of various data formats including CSVs, PDFs, and images.
*   **Audio Transcription:** Integrates Whisper for high-accuracy audio transcription capabilities (optional module).
*   **Autonomous Code Execution:** Features intelligent Python code generation coupled with a sandboxed execution environment that automatically handles dependency installation.
*   **Resilient Problem Solving:** Implements sophisticated retry logic and challenge chaining to successfully navigate multi-step, complex problems.
*   **Complete Observability:** Provides a real-time execution timeline with live, structured logging, ensuring full visibility into agent decision-making.
*   **Modern User Interface:** A responsive, beautifully crafted frontend built on React 19, Tailwind CSS, and Framer Motion.

---

## 🏗️ Architecture

Cortex utilizes a resilient fallback mechanism to ensure continuous operation. 

```text
Application Initialization
        │
        ▼
Credentials Configured? (VITE_AGENT_EMAIL & SECRET)
        │
   ┌────┴─────────────────────────────┐
  YES                                 NO
   │                                  │
 Health Check Ping                  Groq LLM Mode
   │                                (In-Browser execution)
   ├─ Reachable ──► Backend Mode
   └─ Unreachable ──► Groq LLM Mode (Auto-fallback)
```

The UI clearly indicates the active execution mode:
*   🟢 **Python Backend Connected**: Full capabilities active (Playwright, Code Execution, Whisper).
*   🔵 **Groq LLM Mode**: Lightweight, browser-based Planner → Executor → Critic loop.

---

## 🚀 Getting Started

### Prerequisites

*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Recommended)
*   Node.js 18+ (For local frontend development)
*   Python 3.11+ (For local backend development)

### Option 1: Docker (Recommended)

The most efficient way to launch the complete Cortex stack.

1.  **Configure Backend Environment:**
    ```bash
    cp cortex-backend/.env.example cortex-backend/.env
    ```
    *Edit `cortex-backend/.env` with your `GROQ_API_KEY` and authentication credentials.*

2.  **Configure Frontend Environment (Optional):**
    ```bash
    cp agent-vision-hub/.env.example agent-vision-hub/.env
    ```
    *Edit `agent-vision-hub/.env` to configure backend credentials for the UI.*

3.  **Initialize Services:**
    ```bash
    docker-compose up --build
    ```

*   **Frontend Interface:** `http://localhost:3000`
*   **Backend API:** `http://localhost:8000`
*   **API Documentation:** `http://localhost:8000/docs`

---

### Option 2: Local Development Environment

For developers looking to contribute or modify the source code directly.

**Terminal 1 — Backend:**
```bash
cd cortex-backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
playwright install chromium

# Optional: Install ffmpeg for Whisper transcription support (macOS/Linux: apt install ffmpeg)

cp .env.example .env
python main.py --dev
```

**Terminal 2 — Frontend:**
```bash
cd agent-vision-hub
npm install
cp .env.example .env
npm run dev
```

---

### Option 3: Lightweight Mode (Frontend Only)

Run Cortex entirely in the browser using the Groq API, without deploying the Python backend.

```bash
cd agent-vision-hub
npm install
cp .env.example .env
# Ensure VITE_GROQ_API_KEY is populated in your .env
npm run dev
```

---

## 🛠️ Technology Stack

**Frontend Interface:**
*   React 19 & TypeScript
*   TanStack Router
*   Tailwind CSS & shadcn/ui
*   Framer Motion (Animations)
*   Recharts (Data Visualization)

**Backend Infrastructure:**
*   Python 3.11 & FastAPI
*   Groq (Primary LLM Engine)
*   Playwright (Browser Automation)
*   Whisper (Audio Processing)
*   Sandboxed Python Subprocesses

**Deployment:**
*   Docker & Docker Compose
*   Nginx (Production Frontend Serving)

---

## ⚙️ Configuration

### Frontend (`agent-vision-hub/.env`)

| Variable | Required | Description |
| :--- | :--- | :--- |
| `VITE_GROQ_API_KEY` | For LLM Mode | API key from console.groq.com |
| `VITE_API_BASE_URL` | For Backend Mode | Backend endpoint (Default: `http://localhost:8000`) |
| `VITE_AGENT_EMAIL` | For Backend Mode | Must match `EXPECTED_EMAIL` in backend |
| `VITE_AGENT_SECRET` | For Backend Mode | Must match `MY_SECRET` in backend |

### Backend (`cortex-backend/.env`)

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | Yes | API key from console.groq.com |
| `EXPECTED_EMAIL` | Yes | Authentication credential |
| `MY_SECRET` | Yes | Authentication credential |
| `CORS_ORIGINS` | No | Allowed origins (Comma-separated) |
| `CORTEX_DEBUG` | No | Enable verbose debug logging |

---

## 📁 Repository Structure

```text
cortex-agent-platform/
├── agent-vision-hub/                  # React Frontend Application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── agent-engine.ts        # Core Dual-mode routing logic
│   │   │   └── storage.ts             # Persistence layer
│   │   ├── components/                # Reusable UI components
│   │   └── routes/                    # Application views
│   └── Dockerfile
├── cortex-backend/                    # Python FastAPI Backend
│   ├── main.py                        # Core agent execution pipeline
│   ├── requirements.txt
│   └── Dockerfile
└── docker-compose.yml                 # Multi-container orchestration
```
