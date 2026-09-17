#!/usr/bin/env bash
# =========================================================================
# VERBATIM · Piper TTS launcher — neural voice server on :8082
#   POST /tts  {"text","lang"}  ->  audio/wav   (es: daniela-high · en: lessac-medium)
#
# Defaults (override with env vars):
#   PIPER_BIN         $VERBATIM_AI_DIR/piper/piper
#   PIPER_VOICES_DIR  $VERBATIM_AI_DIR/voices
#   PIPER_PORT        8082
#   PIPER_SERVER      <repo>/scripts/piper/server.py
#
# Idempotent: if the server is already up, it just follows the log.
# =========================================================================
set -euo pipefail
. "$(dirname "$0")/common.sh"

SERVER="${PIPER_SERVER:-$(cd "$(dirname "$0")/piper" && pwd)/server.py}"
BIN="${PIPER_BIN:-$VERBATIM_AI_DIR/piper/piper}"
VOICES="${PIPER_VOICES_DIR:-$VERBATIM_AI_DIR/voices}"
PORT="${PIPER_PORT:-8082}"
LOG="${PIPER_LOG:-$VERBATIM_LOG_DIR/piper.log}"

if [ ! -f "$SERVER" ]; then
  verbat_err "server script not found: $SERVER"
  exit 1
fi
if [ ! -x "$BIN" ]; then
  verbat_err "piper binary not found at: $BIN"
  verbat_err "Expected at PIPER_BIN=$BIN"
  verbat_setup_hint
  exit 1
fi
if [ ! -f "$VOICES/es_AR-daniela-high.onnx" ] || [ ! -f "$VOICES/en_US-lessac-medium.onnx" ]; then
  verbat_err "Piper voices not found in: $VOICES"
  verbat_err "Expected at PIPER_VOICES_DIR=$VOICES"
  verbat_setup_hint
  exit 1
fi

mkdir -p "$VERBATIM_LOG_DIR"
verbat_already_running "$PORT" "/" "$LOG" "Piper"

verbat_info "Starting piper-tts (port $PORT, voices=$VOICES)..."
exec python3 "$SERVER" >"$LOG" 2>&1
