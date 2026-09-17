#!/usr/bin/env bash
# =========================================================================
# VERBATIM · Agent (interviewer) launcher — llama.cpp serving an
# OpenAI-compatible endpoint at http://localhost:<PORT>/v1/chat/completions
#
# Defaults (override with env vars):
#   LLAMA_SERVER_BIN  $VERBATIM_AI_DIR/llama.cpp/build/bin/llama-server
#   AGENT_MODEL       $VERBATIM_AI_DIR/models/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf
#   AGENT_PORT        8080
#
# Runs on GPU when llama.cpp was built with CUDA (setup.sh does this
# automatically when an NVIDIA GPU is present), CPU otherwise.
# Idempotent: if the server is already up, it just follows the log.
# =========================================================================
set -euo pipefail
. "$(dirname "$0")/common.sh"

BIN="${LLAMA_SERVER_BIN:-$VERBATIM_AI_DIR/llama.cpp/build/bin/llama-server}"
MODEL="${AGENT_MODEL:-$VERBATIM_AI_DIR/models/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf}"
PORT="${AGENT_PORT:-8080}"
LOG="${AGENT_LOG:-$VERBATIM_LOG_DIR/agent.log}"

if [ ! -f "$MODEL" ]; then
  verbat_err "Model not found: $MODEL"
  verbat_err "Expected at AGENT_MODEL=$MODEL"
  verbat_setup_hint
  exit 1
fi
if [ ! -x "$BIN" ]; then
  verbat_err "llama-server not found at: $BIN"
  verbat_err "Expected at LLAMA_SERVER_BIN=$BIN"
  verbat_setup_hint
  exit 1
fi

mkdir -p "$VERBATIM_LOG_DIR"
verbat_already_running "$PORT" "/health" "$LOG" "Agent"

verbat_info "Starting llama-server (model=$(basename "$MODEL"), port $PORT, $([ -e /proc/driver/nvidia ] && echo GPU || echo CPU))..."
exec "$BIN" -m "$MODEL" --host 127.0.0.1 --port "$PORT" -ngl 99 >"$LOG" 2>&1
