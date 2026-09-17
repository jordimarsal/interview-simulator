#!/usr/bin/env bash
# =========================================================================
# VERBATIM · Whisper launcher (CPU-only, so it never competes for VRAM
# with the LLM). whisper.cpp server:
#   POST http://localhost:<PORT>/inference  ->  {"text": "..."}
#
# Defaults (override with env vars):
#   WHISPER_SERVER_BIN  $VERBATIM_AI_DIR/whisper.cpp/build/bin/whisper-server
#   WHISPER_MODEL       $VERBATIM_AI_DIR/models/ggml-small.bin
#   WHISPER_PORT        8081
#
# Idempotent: if the server is already up, it just follows the log.
# =========================================================================
set -euo pipefail
. "$(dirname "$0")/common.sh"

BIN="${WHISPER_SERVER_BIN:-$VERBATIM_AI_DIR/whisper.cpp/build/bin/whisper-server}"
MODEL="${WHISPER_MODEL:-$VERBATIM_AI_DIR/models/ggml-small.bin}"
PORT="${WHISPER_PORT:-8081}"
LOG="${WHISPER_LOG:-$VERBATIM_LOG_DIR/whisper.log}"

if [ ! -f "$MODEL" ]; then
  verbat_err "Model not found: $MODEL"
  verbat_err "Expected at WHISPER_MODEL=$MODEL"
  verbat_setup_hint
  exit 1
fi
if [ ! -x "$BIN" ]; then
  verbat_err "whisper-server not found at: $BIN"
  verbat_err "Expected at WHISPER_SERVER_BIN=$BIN"
  verbat_setup_hint
  exit 1
fi

mkdir -p "$VERBATIM_LOG_DIR"
verbat_already_running "$PORT" "/inference" "$LOG" "Whisper"

verbat_info "Starting whisper.cpp (model=$(basename "$MODEL"), port $PORT, CPU)..."
exec "$BIN" -m "$MODEL" --host 127.0.0.1 --port "$PORT" >"$LOG" 2>&1
