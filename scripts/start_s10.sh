#!/usr/bin/env bash
# ==============================================================================
# Thermal Frontier Launch Script for Samsung Galaxy S10+ (Termux / Linux)
# Acquires Termux wake-lock (if available) and serves dist/ with SPA fallback.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TF_DIR="${TF_DIR:-$REPO_ROOT}"
DIST_DIR="${TF_DIST_DIR:-${TF_DIR}/dist}"
PID_FILE="${TF_PID_FILE:-${TF_DIR}/.tf_s10.pid}"

export TF_HOST="${TF_HOST:-0.0.0.0}"
export TF_PORT="${TF_PORT:-11667}"

WAKELOCK_ACQUIRED=false
SERVER_PID=""

cleanup() {
    echo ""
    echo "[*] Shutting down Thermal Frontier..."
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    if [ "$WAKELOCK_ACQUIRED" = true ] && command -v termux-wake-unlock >/dev/null 2>&1; then
        echo "[*] Releasing Termux wake-lock..."
        termux-wake-unlock || true
    fi
    exit 0
}

trap cleanup INT TERM EXIT

if [ ! -f "${DIST_DIR}/index.html" ]; then
    echo "[-] Error: Built frontend not found at ${DIST_DIR}/index.html" >&2
    echo "    Run 'npm install && npm run build' in ${TF_DIR} first." >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "[-] Error: Node.js is required to serve Thermal Frontier." >&2
    echo "    On Termux, install it with: pkg install nodejs" >&2
    exit 1
fi

if command -v termux-wake-lock >/dev/null 2>&1; then
    echo "[*] Android/Termux detected. Acquiring CPU wake-lock..."
    termux-wake-lock || true
    WAKELOCK_ACQUIRED=true
fi

LOCAL_IP=""
if command -v ip >/dev/null 2>&1; then
    LOCAL_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
fi
if [ -z "$LOCAL_IP" ] && command -v hostname >/dev/null 2>&1; then
    LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

echo "=========================================================="
echo " Thermal Frontier Server Starting (S10+ / Linux)"
echo " Root:         ${TF_DIR}"
echo " Static dir:   ${DIST_DIR}"
echo " Listening on: http://${TF_HOST}:${TF_PORT}"
if [ -n "$LOCAL_IP" ]; then
    echo " Web UI (LAN): http://${LOCAL_IP}:${TF_PORT}"
fi
echo " Web UI (Loc): http://localhost:${TF_PORT}"
echo " Press Ctrl+C to stop."
echo "=========================================================="

echo "$$" > "$PID_FILE"

DIST_DIR="$DIST_DIR" TF_HOST="$TF_HOST" TF_PORT="$TF_PORT" node --input-type=module - <<'EOF' &
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.env.DIST_DIR);
const host = process.env.TF_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.TF_PORT || '11667', 10);
const indexFile = path.join(distDir, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function sendFile(res, filePath, method) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
    });

    if (method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let urlPath = '/';
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  const relativePath = urlPath.replace(/^\/+/, '');
  const candidate = path.resolve(distDir, relativePath);

  if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(candidate, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, candidate, method);
      return;
    }

    if (urlPath.startsWith('/assets/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    sendFile(res, indexFile, method);
  });
});

server.listen(port, host, () => {
  console.log(`[+] Serving SPA from ${distDir} on http://${host}:${port}`);
});
EOF

SERVER_PID=$!
wait "$SERVER_PID"
