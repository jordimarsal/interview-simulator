# VERBATIM · Voice Interview Simulator

Simulador de entrevistas por voz en **castellano** e **inglés**. Un entrevistador automático te pregunta, tú respondes hablando y un agente IA valora tus respuestas. Se abre con doble clic en `interview.html`; no requiere servidores ni claves para la demo.

## Qué es y cómo funciona

- **El preguntador**: un agente decide qué preguntar. En modo *demo* usa un motor interno; en modo *local* lo interpreta tu propio modelo (`llama-server`). Elige los **temas** de la entrevista en el panel izquierdo (sobre ti, comportamiento, backend, Python y automatización, bases de datos, DevOps): con todo activo alterna lo personal, lo no técnico y lo técnico.
- **El coach**: con cada pregunta, un segundo agente propone al lado dos posibles respuestas — una basada **estrictamente en tu CV** (corpus bilingüe es/en: nunca inventa datos ni métricas) y una respuesta modelo. En modo demo el panel lo indica y no inventa nada.
- **La voz del entrevistador**: síntesis de voz del navegador (`SpeechSynthesis`). Hay un botón para reproducir cada pregunta.
- **Tu respuesta**: se graba con el micrófono y se transcribe con Whisper (vía servidor local) o con la API de voz del navegador. Puedes repetir la grabación las veces que necesites.
- **La evaluación**: al final, el agente devuelve una puntuación con fortalezas y zonas de mejora.

## Cómo abrirlo

Abre `index.html` → pulsa **«Empezar entrevista»**. Elige idioma arriba a la derecha. Todo se ejecuta en tu navegador; no hay dependencias externas.

## Dos modos

### 1. Modo demo (sin nada instalado)
Funciona ya: el entrevistador interno + la voz del navegador. Ideal para probar UX y contenido.

### 2. Modo local (Whisper + LLM reales)

#### Requisitos

| Requisito | Detalle |
|---|---|
| Sistema | Linux x86_64 (probado en Ubuntu 24.04). En macOS/Windows el modo demo funciona igual, pero `setup.sh` no puede instalar Piper (binario solo Linux) |
| Espacio en disco | ~10 GB (modelos + binarios compilados) |
| Compilación | `git`, `curl`, `cmake`, `build-essential` (el instalador los detecta y ofrece instalarlos) |
| GPU | Opcional: con NVIDIA compila llama.cpp con CUDA (entrevistador mucho más rápido); sin GPU todo va en CPU |
| Python 3 | Para el servidor de Piper (solo librería estándar, sin `pip install`) |
| Navegador | Chrome/Edge/Firefox recientes; doble clic en `index.html`, sin servidor web |

#### Instalación (una vez)

```bash
git clone <este-repo>
cd interview-simulator
bash scripts/setup.sh
```

El instalador es **idempotente** (puedes re-ejecutarlo) y descarga/compila todo en `~/.local/share/verbatim` (configurable con `VERBATIM_AI_DIR`):

1. Clona y compila **llama.cpp** → `llama-server` (con CUDA si detecta GPU NVIDIA; si no, CPU)
2. Clona y compila **whisper.cpp** → `whisper-server` (CPU, así no compite por la VRAM con el LLM)
3. Descarga el modelo del agente **Qwen3-VL-8B-Instruct-1M-Q6_K.gguf** (~6,8 GB, Hugging Face)
4. Descarga el modelo de transcripción **ggml-small.bin** (~0,5 GB, whisper.cpp)
5. Descarga el binario de **Piper TTS** y dos voces: `daniela-high` (es) y `lessac-medium` (en)

#### Arrancar los servidores

```bash
# LLM (entrevistador) — puerto 8080
bash scripts/run-agent.sh

# Transcripción (Whisper) — puerto 8081
bash scripts/run-whisper.sh

# Voz neuronal (Piper) — opcional, puerto 8082
bash scripts/run-piper.sh
```

Los tres lanzadores son **idempotentes**: si el servidor ya está corriendo, lo detectan y simplemente siguen su log (`Ctrl+C` para salir del log sin parar el servidor). La app ya viene apuntando a los puertos por defecto:
- Endpoint Whisper: `http://localhost:8081/inference`  (POST multipart `file` → `{"text":"…"}`)
- Agente LLM: `http://localhost:8080/v1/chat/completions`
- Piper TTS: `http://localhost:8082/tts`

Activa **Whisper** en ⚙️ → «Motor de transcripción» y el **Agente entrevistador** en «Local». Para la voz neuronal, elige **Piper** en «Voz del entrevistador». Desde ⚙️ puedes **probar el micro** (graba 3 s, te dice el nivel y qué entiende Whisper) y **probar la voz**. Las tarjetas de estado detectan los servidores solas y ofrecen un botón «Copiar comando» con la ruta real de cada lanzador.

#### Variables de entorno

Todo es overridable, por si ya tienes tus propios binarios/modelos:

| Variable | Defecto | Qué controla |
|---|---|---|
| `VERBATIM_AI_DIR` | `~/.local/share/verbatim` | Directorio base de binarios, modelos, voces y logs |
| `LLAMA_SERVER_BIN` | `$VERBATIM_AI_DIR/llama.cpp/build/bin/llama-server` | Binario de llama-server |
| `AGENT_MODEL` | `$VERBATIM_AI_DIR/models/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf` | Modelo del entrevistador (cualquier GGUF instruct) |
| `AGENT_PORT` | `8080` | Puerto del agente |
| `WHISPER_SERVER_BIN` | `$VERBATIM_AI_DIR/whisper.cpp/build/bin/whisper-server` | Binario de whisper-server |
| `WHISPER_MODEL` | `$VERBATIM_AI_DIR/models/ggml-small.bin` | Modelo whisper.cpp (también valen `small`, `base`… según VRAM/CPU) |
| `WHISPER_PORT` | `8081` | Puerto de Whisper |
| `PIPER_BIN` / `PIPER_VOICES_DIR` / `PIPER_PORT` | bajo `VERBATIM_AI_DIR` / `8082` | Instalación de Piper |

> Modelo recomendado para el agente: `Qwen3-VL-8B-Instruct-1M-Q6_K.gguf` (instruct-tuned, ~6,8 GB, cabe entera en una GPU moderna; contexto de 1 M). Verificado: turno de pregunta en ~0,3 s en GPU. En CPU tarda más: usa un modelo más pequeño (p. ej. un Qwen3 4B en Q4) con `AGENT_MODEL=…`. Para transcripción, `ggml-small.bin` es un buen equilibrio velocidad/calidad en CPU; si prefieres transcripción sin servidor, activa **«Voz del navegador»** en Configuración (Chrome/Edge).

#### Liberar VRAM: desactivar Ollama
Si tienes `ollama.service` habilitado, se arranca solo en cada boot y retiene ~2 GB de VRAM en la GPU aunque no lo uses. Para pararlo ahora y evitar que vuelva a arrancar:

```bash
sudo systemctl disable --now ollama
```

Verifícalo con `systemctl is-active ollama` (debe decir `inactive`) y `nvidia-smi` (la GPU 0 debe bajar a ~0 MiB).

## Estructura

```
interview-simulator/
├── index.html          Landing + selector de idioma
├── interview.html      Sesión de entrevista (panales de Temas y Coach)
├── css/{main,landing,interview}.css
├── js/{i18n,config,cv,questions,speech,orb,agent,app,reveal,whisper-ui,agent-ui}.js
│     · app.js        orquestación de la sesión + Temas + Coach
│     · speech.js     STT (navegador / Whisper WAV) + TTS (navegador / Piper) + tests
│     · agent.js      entrevistador, coach y evaluador (builtin / llama-server)
│     · cv.js         corpus bilingüe del candidato (fuente del coach)
│     · whisper-ui.js detección del servidor Whisper + copia del comando
│     · agent-ui.js   detección del servidor del agente + modelo cargado
│     · reveal.js     animaciones de entrada
├── scripts/
│     · setup.sh       instalador único (compila + descarga todo, idempotente)
│     · run-agent.sh   lanzador del LLM        → :8080
│     · run-whisper.sh lanzador de Whisper     → :8081
│     · run-piper.sh   lanzador de Piper TTS   → :8082
│     · common.sh      entorno compartido (VERBATIM_AI_DIR, helpers)
│     · piper/server.py  servidor TTS de Piper (solo librería estándar)
└── README.md
```

## Notas técnicas

- **Autocontenido**: HTML/CSS/JS locales, sin CDN ni build. Se abre desde `file://` sin instalar nada.
- **Tipografía**: se usan stacks del sistema (`system-ui` / monospace), así que no hace falta descargar archivos de fuentes; la web carga al instante y funciona offline.
- **STT por defecto**: «Voz del navegador» para transcribir ya, sin servidores. En Configuración puedes activar Whisper (endpoint local) para transcripción con whisper.cpp.
- **Acceso directo desde la página**: al seleccionar Whisper, una tarjeta detecta automáticamente si el servidor está corriendo y ofrece un botón «Copiar comando» (`bash scripts/run-whisper.sh` con la ruta absoluta real) para arrancarlo en un clic.
- **Accesibilidad**: respeta `prefers-reduced-motion`; los controles son navegables por teclado (Espacio = grabar/parar).
- **Privacidad**: la configuración se guarda en `localStorage`; nada sale de tu navegador salvo que configures un endpoint remoto.

## Auditorías

El proyecto se pulió en tres rondas de auditoría adversarial: autocontenimiento (todo funciona abriendo el HTML sin servidor), UX/copy/accesibilidad, y flujo completo de entrevista. Cada ronda cerró los huecos encontrados antes de pasar a la siguiente.
