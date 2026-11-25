#!/usr/bin/env bash
# ==============================================================================
# Thermal Frontier S10+ (Termux) Build & Deploy Helper
# Builds production bundle, packages runtime files, and optionally deploys via
# scp/ssh to a Samsung Galaxy S10+ running Termux.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_HOST="${1:-${TERMUX_HOST:-}}"
TARGET_PORT="${2:-${TERMUX_PORT:-8022}}"

echo "=== Building Thermal Frontier Production Release ==="
cd "$REPO_ROOT"

if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

npm run build

TMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PACKAGE_FILE="$TMP_DIR/thermal-frontier-deploy.tar.gz"

echo "=== Packaging Release Bundle ==="
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.DS_Store' \
    -czf "$PACKAGE_FILE" \
    dist \
    scripts \
    package.json \
    README.md

echo "Release package created: $PACKAGE_FILE ($(du -h "$PACKAGE_FILE" | cut -f1))"

if [ -n "$TARGET_HOST" ]; then
    echo "=== Deploying to Termux device: ${TARGET_HOST}:${TARGET_PORT} ==="
    scp -P "$TARGET_PORT" "$PACKAGE_FILE" "${TARGET_HOST}:~/thermal-frontier-deploy.tar.gz"

    ssh -p "$TARGET_PORT" "$TARGET_HOST" 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail

APP_DIR="$HOME/thermal-frontier"
mkdir -p "$APP_DIR"

if [ -f "$APP_DIR/.tf_s10.pid" ]; then
    OLD_PID="$(cat "$APP_DIR/.tf_s10.pid" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[*] Stopping existing Thermal Frontier server (PID $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
    fi
fi

tar -xzf "$HOME/thermal-frontier-deploy.tar.gz" -C "$APP_DIR"
rm -f "$HOME/thermal-frontier-deploy.tar.gz"
chmod +x "$APP_DIR/scripts/"*.sh

echo "[*] Starting Thermal Frontier on S10+..."
nohup "$APP_DIR/scripts/start_s10.sh" > "$APP_DIR/server.log" 2>&1 < /dev/null &
sleep 1

if [ -f "$APP_DIR/.tf_s10.pid" ] && kill -0 "$(cat "$APP_DIR/.tf_s10.pid")" 2>/dev/null; then
    echo "[+] Thermal Frontier running (PID $(cat "$APP_DIR/.tf_s10.pid")). Log: $APP_DIR/server.log"
else
    echo "[!] Check $APP_DIR/server.log for startup details."
    tail -n 20 "$APP_DIR/server.log" || true
fi
REMOTE_SCRIPT

    echo "Deployment to ${TARGET_HOST} finished successfully!"
else
    OUT_FILE="/tmp/thermal-frontier-deploy.tar.gz"
    cp "$PACKAGE_FILE" "$OUT_FILE"
    echo "Note: No target host specified."
    echo "Usage: ./scripts/deploy_s10.sh <user@phone_ip> [ssh_port]"
    echo "Local release archive saved to: $OUT_FILE"
fi
