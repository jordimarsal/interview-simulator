# VERBATIM · Voice Interview Simulator

Simulador de entrevistas por voz en **castellano** e **inglés**. Un entrevistador automático te pregunta, tú respondes hablando y un agente IA valora tus respuestas. Se abre con doble clic en `interview.html`; no requiere servidores ni claves para la demo.

## Qué es y cómo funciona

- **El preguntador**: un agente decide qué preguntar. En modo *demo* usa un motor interno; en modo *local* lo interpreta tu propio modelo (`llama-server`).
- **La voz del entrevistador**: síntesis de voz del navegador (`SpeechSynthesis`). Hay un botón para reproducir cada pregunta.
- **Tu respuesta**: se graba con el micrófono y se transcribe con Whisper (vía servidor local) o con la API de voz del navegador. Puedes repetir la grabación las veces que necesites.
- **La evaluación**: al final, el agente devuelve una puntuación con fortalezas y zonas de mejora.

## Cómo abrirlo

Abre `index.html` → pulsa **«Empezar entrevista»**. Elige idioma arriba a la derecha. Todo se ejecuta en tu navegador; no hay dependencias externas.

## Dos modos

### 1. Modo demo (sin nada instalado)
Funciona ya: el entrevistador interno + la voz del navegador. Ideal para probar UX y contenido.

### 2. Modo local (Whisper + LLM reales)
Ejecuta dos servidores locales (puertos distintos) y apunta la app a ellos desde **⚙️ Configuración**:

```bash
# LLM (entrevistador) — llama.cpp, en GPU, puerto 8080
~/ia/run-agent.sh

# Transcripción (Whisper) — CPU, puerto 8081 (no compite por la VRAM con el LLM)
~/ia/run-whisper.sh
```

Los dos lanzadores son **idempotentes**: si el servidor ya está corriendo, lo detectan y simplemente siguen su log (`Ctrl+C` para salir del log sin parar el servidor).

La app ya viene apuntando a los puertos por defecto:
- Endpoint Whisper: `http://localhost:8081/inference`  (POST multipart `file` → `{"text":"…"}`)
- Agente LLM: `http://localhost:8080/v1/chat/completions`

Activa **Whisper** en ⚙️ → «Motor de transcripción» y el **Agente entrevistador** en «Local».

> Modelo recomendado para el agente: `~/ia/llama/models/Qwen3-VL-8B-Instruct-1M-Q6_K.gguf` (instruct-tuned, ~5 GB, cabe entera en una GPU; contexto de 1 M). Arráncalo con `~/ia/run-agent.sh` — verificado: turno de pregunta en ~0,3 s en GPU. Para transcripción usa el modelo pequeño `~/ia/ggml-small.bin` con whisper.cpp; si prefieres transcripción sin servidor, activa **«Voz del navegador»** en Configuración (Chrome/Edge).

#### Liberar VRAM: desactivar Ollama
Esta máquina tiene `ollama.service` **habilitado por defecto**: se arranca solo en cada boot y retiene ~2 GB de VRAM en la GPU 0 aunque no lo uses. Para pararlo ahora y evitar que vuelva a arrancar:

```bash
sudo systemctl disable --now ollama
```

Verifícalo con `systemctl is-active ollama` (debe decir `inactive`) y `nvidia-smi` (la GPU 0 debe bajar a ~0 MiB).

## Estructura

```
interview-simulator/
├── index.html          Landing + selector de idioma
├── interview.html      Sesión de entrevista
├── css/{main,landing,interview}.css
├── js/{i18n,config,questions,speech,orb,agent,app,reveal,whisper-ui}.js
│     · app.js        orquestación de la sesión
│     · speech.js     STT (navegador / Whisper) + TTS
│     · agent.js      entrevistador (builtin / llama-server)
│     · whisper-ui.js detección del servidor Whisper + copia del comando
│     · reveal.js     animaciones de entrada
└── README.md
```

## Notas técnicas

- **Autocontenido**: HTML/CSS/JS locales, sin CDN ni build. Se abre desde `file://` sin instalar nada.
- **Tipografía**: se usan stacks del sistema (`system-ui` / monospace), así que no hace falta descargar archivos de fuentes; la web carga al instante y funciona offline.
- **STT por defecto**: «Voz del navegador» para transcribir ya, sin servidores. En Configuración puedes activar Whisper (endpoint local) para transcripción con whisper.cpp.
- **Acceso directo desde la página**: al seleccionar Whisper, una tarjeta detecta automáticamente si el servidor está corriendo y ofrece un botón «Copiar comando» (`~/ia/run-whisper.sh`) para arrancarlo en un clic.
- **Accesibilidad**: respeta `prefers-reduced-motion`; los controles son navegables por teclado (Espacio = grabar/parar).
- **Privacidad**: la configuración se guarda en `localStorage`; nada sale de tu navegador salvo que configures un endpoint remoto.

## Auditorías

El proyecto se pulió en tres rondas de auditoría adversarial: autocontenimiento (todo funciona abriendo el HTML sin servidor), UX/copy/accesibilidad, y flujo completo de entrevista. Cada ronda cerró los huecos encontrados antes de pasar a la siguiente.
