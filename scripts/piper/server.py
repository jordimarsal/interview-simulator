#!/usr/bin/env python3
"""VERBATIM · Piper TTS server
POST /tts  {"text": "...", "lang": "es"|"en"}  →  audio/wav
GET  /     → {"status":"ok"}  (health check)
Standard library only. Spawn-per-request (model load ~0.12 s, RTF ~0.03).

Environment:
    PIPER_BIN          path to the piper binary
                       (default: ~/.local/share/verbatim/piper/piper)
    PIPER_VOICES_DIR   directory with the .onnx voices + .json configs
                       (default: ~/.local/share/verbatim/voices)
    PIPER_PORT         listen port (default: 8082)
"""
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

AI_DIR = os.environ.get("VERBATIM_AI_DIR", os.path.expanduser("~/.local/share/verbatim"))
PIPER = os.environ.get("PIPER_BIN", os.path.join(AI_DIR, "piper", "piper"))
VOICE_DIR = os.environ.get("PIPER_VOICES_DIR", os.path.join(AI_DIR, "voices"))
VOICES = {
    "es": os.path.join(VOICE_DIR, "es_AR-daniela-high.onnx"),
    "en": os.path.join(VOICE_DIR, "en_US-lessac-medium.onnx"),
}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok","server":"piper-tts"}')

    def do_POST(self):
        if self.path != "/tts":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except Exception:
            body = {}
        text = (body.get("text") or "").strip()
        lang = body.get("lang") or "es"
        if not text:
            self._json(400, {"error": "text required"})
            return
        model = VOICES.get(lang, VOICES["es"])
        fd, out = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            subprocess.run(
                [PIPER, "-m", model, "-c", model + ".json", "-f", out],
                input=text.encode(), capture_output=True, timeout=60, check=True,
            )
            with open(out, "rb") as f:
                wav = f.read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)
        except Exception as e:
            self._json(500, {"error": str(e)})
        finally:
            try:
                os.unlink(out)
            except OSError:
                pass

    def _json(self, code, obj):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PIPER_PORT", "8082"))
    print("[piper-tts] listening on http://localhost:%d/tts" % port)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
