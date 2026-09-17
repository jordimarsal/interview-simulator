#!/usr/bin/env bash
# =========================================================================
# VERBATIM · shared environment for the local-server scripts.
#
# Everything lives under one base directory (binaries, models, voices,
# logs) so the app is easy to install and easy to remove:
#
#     VERBATIM_AI_DIR (default: ~/.local/share/verbatim)
#       ├── llama.cpp/     (repo + built llama-server)
#       ├── whisper.cpp/   (repo + built whisper-server)
#       ├── piper/         (piper binary from the release tarball)
#       ├── models/        (GGUF LLM + ggml whisper model)
#       ├── voices/        (piper .onnx voices + .json configs)
#       └── logs/          (agent.log / whisper.log / piper.log)
#
# Source this file:  . "$(dirname "$0")/common.sh"
# =========================================================================

VERBATIM_AI_DIR="${VERBATIM_AI_DIR:-$HOME/.local/share/verbatim}"
export VERBATIM_AI_DIR

VERBATIM_LOG_DIR="$VERBATIM_AI_DIR/logs"

# --- message helpers -----------------------------------------------------
verbat_info() { printf '[verbatim] %s\n' "$1"; }
verbat_err()  { printf '[verbatim] ERROR: %s\n' "$1" >&2; }

# Hint shown whenever a launcher cannot find its binary/model.
verbat_setup_hint() {
  verbat_err "Run the installer first:"
  verbat_err "    bash scripts/setup.sh"
  verbat_err "(or point the variable above at an existing install)."
}

# --- idempotent-start helper ---------------------------------------------
# verbat_already_running <port> <path> <log> <label>
# If something answers on http://localhost:<port><path>, follow the log
# instead of starting a second server. Ctrl+C quits the log only.
verbat_already_running() {
  local port="$1" path="$2" log="$3" label="$4"
  if curl -s -o /dev/null "http://localhost:$port$path" 2>/dev/null; then
    verbat_info "$label already running at http://localhost:$port$path — following the log (Ctrl+C to detach)"
    mkdir -p "$(dirname "$log")"
    touch "$log"
    exec tail -f "$log"
  fi
}
