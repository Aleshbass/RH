# Rehabify Learn video encoder (Railway). Build from the repo root:
#   docker build -f services/learn-video-worker/Dockerfile .
# Railway: Root Directory = repo root, Dockerfile Path = services/learn-video-worker/Dockerfile
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Only the pipeline and the worker: no app code, no secrets, no node_modules needed
COPY scripts/learn-video ./scripts/learn-video
COPY services/learn-video-worker ./services/learn-video-worker

ENV NODE_ENV=production
USER node
CMD ["node", "services/learn-video-worker/worker.mjs"]
