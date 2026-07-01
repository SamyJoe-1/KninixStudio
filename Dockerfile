# Kninix Studio — headless MCP server (no GUI, no Electron).
# Ships Node + ffmpeg only; the Engine is pure Node so there are zero npm runtime deps.
FROM node:22-slim

# ffmpeg + ffprobe are the only system requirement (media probe / encode / export).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install runtime deps only (Electron is a devDependency and is skipped here).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source.
COPY electron ./electron
COPY renderer ./renderer
COPY docs ./docs

# Persist media/exports/proxies outside the container by mounting a volume here.
ENV KX_DATA_DIR=/data \
    KX_OUT_DIR=/data/exports \
    KX_HEADLESS=1 \
    KX_MCP_TRANSPORT=http \
    KX_MCP_HOST=0.0.0.0 \
    KX_MCP_PORT=3333
RUN mkdir -p /data/exports
VOLUME ["/data"]

EXPOSE 3333

# Container health = the MCP HTTP server answering /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.KX_MCP_PORT||3333)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Default: networked HTTP+SSE MCP. Set KX_MCP_TOKEN to require a bearer token.
CMD ["node", "electron/mcp/server.js", "--http"]
