# ── Cortex Frontend — Dockerfile ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Build args become VITE_ env vars baked into the bundle at build time.
# VITE_API_BASE_URL must be "" (empty) for Docker/nginx so browsers use
# relative paths (/api, /health) that nginx proxies to the backend container.
ARG VITE_API_BASE_URL=""
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_GROQ_API_KEY=""
ARG VITE_AGENT_EMAIL=""
ARG VITE_AGENT_SECRET=""

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GROQ_API_KEY=$VITE_GROQ_API_KEY
ENV VITE_AGENT_EMAIL=$VITE_AGENT_EMAIL
ENV VITE_AGENT_SECRET=$VITE_AGENT_SECRET

RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
