# Kninix Studio — Deploying the headless MCP server (VPS)

Kninix runs in two shapes from the **same code**:

| Where | How you run it | Engine source | GUI |
|---|---|---|---|
| **Desktop** | `npm start` (+ MCP attaches to the app) | the running app | yes |
| **VPS / server** | `npm run mcp:http` or `mcp:headless` | its own in-process Engine | none |

Nothing about the desktop workflow changes — `npm start` and the existing Claude Desktop
config still attach the MCP sidecar to the live app exactly as before. The additions below
only matter when there is **no GUI**.

## Requirements

- **Node.js ≥ 18** (repo is developed on 22).
- **ffmpeg + ffprobe** on `PATH` (or set `KX_FFMPEG` / `KX_FFPROBE`).
- **No npm runtime dependencies.** Electron is a *devDependency* and is never installed on
  the server (`npm install --omit=dev`). The Engine is pure Node + ffmpeg.

## Run modes

```bash
# stdio, own Engine — for clients that launch the process (e.g. Claude Desktop over SSH)
npm run mcp:headless          # = node electron/mcp/server.js --headless

# HTTP + SSE, own Engine — for remote MCP clients over the network
npm run mcp:http              # = node electron/mcp/server.js --http

# sanity check the protocol end-to-end, no GUI, no ffmpeg encode needed to start
npm run mcp:selftest
```

## Option A — stdio over SSH (simplest, most secure)

No open ports. The client opens an SSH connection and speaks JSON-RPC over the pipe.
Point your MCP client's command at:

```json
{
  "mcpServers": {
    "kninix-remote": {
      "command": "ssh",
      "args": ["user@your-vps", "cd /opt/kninix_studio && node electron/mcp/server.js --headless"]
    }
  }
}
```

## Option B — HTTP + SSE (remote, networked)

The server exposes:
- `GET /sse` — SSE stream (server→client)
- `POST /message?session=<id>` — client→server JSON-RPC
- `GET /health` — unauthenticated liveness probe
- `GET /` — human-readable endpoint hint

**Security model:** the bind host decides exposure.
- `KX_MCP_HOST=127.0.0.1` (default) → reach it via an SSH tunnel:
  `ssh -L 3333:127.0.0.1:3333 user@your-vps`, then point the client at
  `http://127.0.0.1:3333/sse`. No token needed.
- `KX_MCP_HOST=0.0.0.0` (public) → **you must set `KX_MCP_TOKEN`**. The server warns on
  startup otherwise. Clients send it as `Authorization: Bearer <token>` or `?token=<token>`.
  Always terminate TLS in front (Caddy/nginx) — the token is a bearer secret.

```bash
export KX_MCP_HOST=0.0.0.0
export KX_MCP_TOKEN="$(openssl rand -hex 32)"
export KX_ENCODER=libx264          # CPU-only VPS
npm run mcp:http
```

## Option C — Docker

```bash
cp .env.example .env               # set KX_MCP_TOKEN if exposing publicly
docker compose -f deploy/docker-compose.yml up -d --build
curl http://127.0.0.1:3333/health  # {"ok":true,...}
```

The image bundles ffmpeg and mounts a `/data` volume for media/exports/proxies.

## Option D — systemd

```bash
sudo useradd --system --home /var/lib/kninix kninix
sudo mkdir -p /opt/kninix_studio && sudo rsync -a ./ /opt/kninix_studio/
sudo mkdir -p /etc/kninix && sudo cp .env.example /etc/kninix/kninix.env   # edit it
sudo cp deploy/kninix-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now kninix-mcp
journalctl -u kninix-mcp -f
```

## Configuration reference

See [`.env.example`](.env.example). Key vars: `KX_MCP_TRANSPORT`, `KX_MCP_HOST`,
`KX_MCP_PORT`, `KX_MCP_TOKEN`, `KX_DATA_DIR`, `KX_OUT_DIR`, `KX_FFMPEG`, `KX_FFPROBE`,
`KX_ENCODER`, `KX_MAX_CONCURRENT`.

## Known limitation on headless (important)

Baking **canvas overlays** — text, shapes, widgets, captions — into an exported MP4 is done
by the Electron *renderer*, which does not exist headless. So on the VPS, `export`:

- ✅ stitches/trims video & audio clips, applies **filters** and **clip transitions**, and
  takes the **lossless stream-copy** path for pure cuts, all via ffmpeg;
- ❌ does **not** yet burn in text/shape/widget overlays.

Everything else in the tool surface (import, timeline edits, markers, jobs, undo/redo,
state/resource reads) works identically headless. This matches the project's existing
export gap — a native (ffmpeg `drawtext`/`overlay`) headless renderer is the follow-up if
you need burned-in captions on the server.
