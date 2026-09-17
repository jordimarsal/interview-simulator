#!/usr/bin/env bash
# =========================================================================
# VERBATIM · one-shot installer for the local servers.
#
# Installs everything needed for the "local mode" of the interview
# simulator, under VERBATIM_AI_DIR (default: ~/.local/share/verbatim):
#
#   1. System deps (git, curl, cmake, a C/C++ compiler)
#   2. llama.cpp  → llama-server  (GPU/CUDA if an NVIDIA card is present)
#   3. whisper.cpp → whisper-server (CPU)
#   4. LLM model  Qwen3-VL-8B-Instruct-1M-Q6_K.gguf  (~6.8 GB)
#   5. STT model  ggml-small.bin                     (~0.5 GB)
#   6. Piper TTS binary + two voices (es: daniela-high, en: lessac-medium)
#
# Idempotent: safe to re-run; existing artifacts are skipped.
# Disk space needed: ~8 GB (plus build tools). Network required.
# =========================================================================
set -euo pipefail
. "$(dirname "$0")/common.sh"

LLAMA_REPO="${LLAMA_REPO:-https://github.com/ggml-org/llama.cpp}"
WHISPER_REPO="${WHISPER_REPO:-https://github.com/ggml-org/whisper.cpp}"

LLM_MODEL_URL="${LLM_MODEL_URL:-https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-1M-GGUF/resolve/main/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf}"
STT_MODEL_URL="${STT_MODEL_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin}"
PIPER_TARBALL_URL="${PIPER_TARBALL_URL:-https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz}"

HF_VOICE_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"
VOICE_ES="$HF_VOICE_BASE/es/es_AR/daniela/high/es_AR-daniela-high.onnx"
VOICE_ES_JSON="$HF_VOICE_BASE/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json"
VOICE_EN="$HF_VOICE_BASE/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
VOICE_EN_JSON="$HF_VOICE_BASE/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

ARCH="$(uname -m)"

# --- 1. system dependencies ---------------------------------------------
need=()
for c in git curl cmake make c++; do
  command -v "$c" >/dev/null 2>&1 || need+=("$c")
done
if [ ${#need[@]} -gt 0 ]; then
  verbat_err "Missing system packages: ${need[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    printf '[verbatim] Install them now with sudo apt-get? [y/N] '
    read -r ans || ans=""
    if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
      sudo apt-get update
      sudo apt-get install -y git curl cmake build-essential
    else
      verbat_err "Install manually:  sudo apt-get install -y git curl cmake build-essential"
      exit 1
    fi
  else
    verbat_err "Install git/curl/cmake and a C++ toolchain with your package manager, then re-run."
    exit 1
  fi
fi

mkdir -p "$VERBATIM_AI_DIR/models" "$VERBATIM_AI_DIR/voices" "$VERBATIM_LOG_DIR"

# --- helpers -------------------------------------------------------------
fetch() { # fetch <url> <dest-file>
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then
    verbat_info "Already downloaded: $(basename "$dest")"
    return 0
  fi
  verbat_info "Downloading $(basename "$dest") ..."
  curl -L --fail --retry 3 -C - -o "$dest" "$url"
}

build_repo() { # build_repo <src-dir> <binary-relpath> <target> [extra cmake flags...]
  local src="$1" binrel="$2" target="$3"; shift 3
  if [ -x "$src/$binrel" ]; then
    verbat_info "Already built: $binrel"
    return 0
  fi
  verbat_info "Configuring $src ..."
  cmake -S "$src" -B "$src/build" "$@"
  verbat_info "Building $target ($(nproc) jobs) — this can take a few minutes ..."
  cmake --build "$src/build" --target "$target" -j "$(nproc)"
}

# --- 2. llama.cpp ---------------------------------------------------------
if [ -x "$VERBATIM_AI_DIR/llama.cpp/build/bin/llama-server" ]; then
  verbat_info "llama.cpp already built"
else
  if [ ! -d "$VERBATIM_AI_DIR/llama.cpp" ]; then
    verbat_info "Cloning llama.cpp ..."
    git clone --depth 1 "$LLAMA_REPO" "$VERBATIM_AI_DIR/llama.cpp"
  fi
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1 && command -v nvcc >/dev/null 2>&1; then
    verbat_info "NVIDIA GPU + CUDA toolkit detected → building llama.cpp with CUDA"
    build_repo "$VERBATIM_AI_DIR/llama.cpp" "build/bin/llama-server" "llama-server" -DGGML_CUDA=ON
  else
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
      verbat_info "NVIDIA GPU detected but no CUDA toolkit (nvcc) → building llama.cpp for CPU"
    else
      verbat_info "No NVIDIA GPU detected → building llama.cpp for CPU"
    fi
    build_repo "$VERBATIM_AI_DIR/llama.cpp" "build/bin/llama-server" "llama-server"
  fi
fi

# --- 3. whisper.cpp -------------------------------------------------------
if [ -x "$VERBATIM_AI_DIR/whisper.cpp/build/bin/whisper-server" ]; then
  verbat_info "whisper.cpp already built"
else
  if [ ! -d "$VERBATIM_AI_DIR/whisper.cpp" ]; then
    verbat_info "Cloning whisper.cpp ..."
    git clone --depth 1 "$WHISPER_REPO" "$VERBATIM_AI_DIR/whisper.cpp"
  fi
  build_repo "$VERBATIM_AI_DIR/whisper.cpp" "build/bin/whisper-server" "whisper-server"
fi

# --- 4/5. models ----------------------------------------------------------
fetch "$LLM_MODEL_URL" "$VERBATIM_AI_DIR/models/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf"
fetch "$STT_MODEL_URL" "$VERBATIM_AI_DIR/models/ggml-small.bin"

# --- 6. piper -------------------------------------------------------------
if [ "$(uname -s)" != "Linux" ] || [ "$ARCH" != "x86_64" ]; then
  verbat_err "Piper binary is Linux x86_64 only (you are $(uname -s) $ARCH). Skipping Piper — the browser voice still works."
else
  if [ ! -x "$VERBATIM_AI_DIR/piper/piper" ]; then
    verbat_info "Downloading Piper TTS ..."
    tmp="$(mktemp -d)"
    curl -L --fail --retry 3 -o "$tmp/piper.tar.gz" "$PIPER_TARBALL_URL"
    tar -xzf "$tmp/piper.tar.gz" -C "$VERBATIM_AI_DIR"
    rm -rf "$tmp"
  else
    verbat_info "Piper already installed"
  fi
  fetch "$VOICE_ES"      "$VERBATIM_AI_DIR/voices/es_AR-daniela-high.onnx"
  fetch "$VOICE_ES_JSON" "$VERBATIM_AI_DIR/voices/es_AR-daniela-high.onnx.json"
  fetch "$VOICE_EN"      "$VERBATIM_AI_DIR/voices/en_US-lessac-medium.onnx"
  fetch "$VOICE_EN_JSON" "$VERBATIM_AI_DIR/voices/en_US-lessac-medium.onnx.json"
fi

# --- done -----------------------------------------------------------------
verbat_info "All set. Start the servers from the repo root:"
verbat_info "    bash scripts/run-agent.sh    # LLM interviewer   :8080"
verbat_info "    bash scripts/run-whisper.sh  # transcription     :8081"
verbat_info "    bash scripts/run-piper.sh    # neural voice      :8082"
