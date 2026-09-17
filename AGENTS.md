# AGENTS.md — VERBATIM · Voice Interview Simulator

> Documento de contexto para agentes IA (y humanos) que trabajen en este proyecto.
> Resume qué es, cómo está hecho, qué contratos no se pueden romper y cómo verificar los cambios.

## 1. Qué es

Simulador de entrevistas por voz en **castellano e inglés**: un agente entrevistador pregunta, el candidato responde hablando, un **Coach** propone dos respuestas posibles a cada pregunta (una estrictamente del CV) y un evaluador puntúa al final. **Autocontenido**: se abre haciendo doble clic en `index.html` (protocolo `file://`), sin build, sin CDN, sin frameworks, sin cuenta. Todo debe funcionar offline en modo demo.

## 2. Estructura y roles

```
index.html          Landing + selector de idioma (scripts: i18n, reveal)
interview.html      Sesión de entrevista (todos los módulos)
css/{main,landing,interview}.css
js/i18n.js          Strings bilingües + aplicación de locale + wire del selector
js/config.js        Config persistida (localStorage) + drawer de settings + voces/micrófonos
js/questions.js     Banco de 26 preguntas bilingües + TOPICS (personal, behavioral,
                    backend, python, databases, devops) + setTopics()/topicLabels()
                    para el selector de temas (filtra builtin y prompt remoto)
js/speech.js        TTS (Piper :8082 | SpeechSynthesis) + STT (Web Speech | Whisper
                    via MediaRecorder→WAV) + testMic(onStart) y test de voz;
                    activeMicId() expone el micro capturando ahora mismo
js/orb.js           Visualización canvas del orbe (estados idle/agent/listening/thinking)
js/agent.js         Entrevistador + Coach + Evaluador + Revisor de respuestas:
                    modo 'builtin' (heurístico) | 'remote' (llama-server).
                    chat(opts) es el punto único LLM
js/cv.js            Corpus bilingüe VERBATIM_CV = {es, en} (fuentes: CV Python Senior
                    2026 .docx + docs/CV_26.md) — el Coach solo puede basar la
                    respuesta "cv" en estos datos; nada inventado
js/app.js           Orquestador/máquina de estados: IDLE→ASKING→RECORDING→THINKING→…
                    + paneles Coach y Temas + viñetas de revisión bajo cada
                    respuesta + botones de prueba de micro y voz
js/whisper-ui.js    Tarjeta de detección del servidor Whisper + copia del comando
js/agent-ui.js      Tarjeta de detección del servidor del agente + nombre del modelo cargado
js/reveal.js        Animaciones de entrada
```

Servidores locales, lanzadores e instalador **dentro del repo** (`scripts/`):
`scripts/setup.sh` (instalador idempotente: compila llama.cpp/whisper.cpp y descarga
modelos + voces en `VERBATIM_AI_DIR`, por defecto `~/.local/share/verbatim`) +
llanzadores `scripts/run-agent.sh` (`:8080`), `scripts/run-whisper.sh` (`:8081`),
`scripts/run-piper.sh` (`:8082`) + servidor de voz `scripts/piper/server.py`
— POST `/tts {text, lang}` → WAV (es: `daniela-high`, en: `lessac-medium`).

## 3. Contratos que no se pueden romper

- **`file://` es ciudadanía de primera**: ningún módulo puede depender de http(s), CDN, workers o cookies. `fetch` a `localhost` está permitido (llama-server envía CORS que refleja el origen).
- **`i18n.STRINGS` está indexado por CLAVE, no por idioma**: `STRINGS["nav_start"].es` — nunca `STRINGS["es"]`. Esta confusión de forma ya rompió el selector de idioma una vez.
- **`agent.js chat(opts)`** recibe UN solo objeto `{messages, max_tokens, temperature, response_format}`. El body debe incluir `messages` siempre (un 400 silenciado se convierte en `""` → burbuja vacía). Si una pregunta llega vacía, hay que lanzar error para que `poseQuestion` muestre el fallback.
- **Coach (`Agent.suggestAnswers(question, lang, history)`)**: para cada pregunta devuelve `{cv, general}` (JSON con `facts` primero: 1-2 datos del perfil relevantes, después la respuesta solo desarrolla esos hechos). Recibe el histórico reciente para resolver anáforas («those challenges»). La respuesta `cv` debe fundamentarse ESTRICTAMENTE en `window.VERBATIM_CV[lang]` (js/cv.js, corpus bilingüe) — nada inventado, **ninguna métrica ni `%`**: los modelos se anclan a «reduced X by 40%» y el corpus no tiene cifras; `stripPercentSentences()` lo garantiza mecánicamente. En modo builtin el panel muestra un hint, no respuestas falsas.
- **Revisor de respuestas (`Agent.reviewAnswer(question, answer)`)**: viñetas de errores/aciertos bajo cada respuesta del candidato (dentro de su tarjeta, via `fireReview` en app.js). Devuelve `{errors:[{cat,text}], good:[text]}` con `cat ∈ {gramatica, vocabulario, concepto}`. Remoto llama al LLM; builtin/heurístico es el fallback offline Y la degradación si remoto falla — nunca lanza, siempre resuelve. Corre en paralelo con `evaluateAnswer`: NO puede bloquear el turno siguiente ni retrasarlo. Si la tarjeta se elimina (re-grabar), el resultado se descarta silenciosamente.
- **Temas**: `Questions.setTopics()` filtra el banco para el selector izquierdo (builtin) y `topicLabels(lang)` inyecta «TEMAS PERMITIDOS» al prompt remoto. Una pregunta sin tema válido nunca debe bloquear la sesión (degradación: repite dentro del tema, después todo el banco).
- **`app.js` sobreescribe `fields.load/save`** al llamar `Config.initDrawer(...)`: la ruta viva del drawer es `loadSettingsIntoDrawer()` y el `save` inline de app.js. Lo que se cablee en `config.js wireDrawer()` es código muerto si app.js no lo usa.
- **Permisos de micro**: los labels de `enumerateDevices()` llegan solo después de un `getUserMedia`. El desbloqueo se hace SOLO al abrir ⚙️ (`populateMics(sel, true)`), nunca al cargar la página. El dropdown resuelve el nombre real del micro por defecto via el pseudo-dispositivo `deviceId === "default"` (solo Chrome; Firefox degrada sin nombre) y etiqueta `· por defecto` / `· en uso` (via `Speech.activeMicId()`). Los «Monitor of …» (loopbacks de salida PipeWire que graban silencio) se FILTRAN del desplegable y un `micId` que apunte a un monitor se cura hacia el default (`isMonitorSource`).
- **Web Speech API no permite elegir micrófono** (limitación de plataforma): la selección (`micId`) solo afecta a la grabación Whisper (`deviceId: {exact}`).
- **Puertos**: agente LLM `:8080` (`/v1/chat/completions`, `/v1/models`), Whisper `:8081` (`/inference`, POST multipart `file`+`language` → `{"text"}`), Piper TTS `:8082` (`/tts`, JSON `{text,lang}` → WAV). Lanzadores idempotentes: `scripts/run-agent.sh`, `scripts/run-whisper.sh`, `scripts/run-piper.sh` (rutas y binarios sobreescrivibles vía `VERBATIM_AI_DIR`, `AGENT_MODEL`, `WHISPER_MODEL`, `PIPER_BIN`, …).
- **Whisper siempre con `language` forzado** (es/en): la auto-detección alucina en audio marginal (inglés fantasma, `[BEEP]`, `[BLANK_AUDIO]`). El texto de transcripción se limpia de marcadores no-verbales (`[...]`/`(...)`) antes de mostrarse.
- **El whisper-server solo descodifica WAV** (no está enlazado con ffmpeg): un POST webm/mp4 responde `{"error":"failed to read audio data"}`. Por eso `speech.js` convierte la grabación de MediaRecorder a **WAV 16 kHz mono PCM16 en el navegador** (`decodeAudioData` + `OfflineAudioContext` + `encodeWavPcm16`) antes de POSTar. No eliminar esta conversión.
- **Errores de STT/TTS nunca en silencio**: se superficializan via `window.Speech.onError(msg)` (app.js los muestra como toast). Una respuesta vacía sin aviso es un bug, no un comportamiento aceptable.
- **Copy bilingüe**: todo texto nuevo va a `i18n.js` con clave estable y entradas `es` + `en`. Sin textos hardcoded en los HTML (usa `data-i18n`).

## 4. Estilo de código

- IIFE + `"use strict"`, ES5-ish (`function () {}`, sin clases ni módulos ESM), globals expuestos como `window.Modulo`.
- Defensivo: nada lanza sin capturar; degradación graceful (STT manual → editor en pantalla; error de LLM → fallback copy).
- Comentarios de capsulera por módulo; dentro del código, solo los que explican un "por qué" no evidente.
- Sin dependencias externas de ningún tipo. Lo que se añada tiene que seguir siendo doble-clic-abrible.

## 5. Cómo verificar cambios

```bash
# 1. Sintaxis de todos los módulos
for f in js/*.js; do node --check "$f"; done
for f in scripts/*.sh; do bash -n "$f"; done

# 2. E2E con jsdom (carga interview.html real, simula el tap del micro,
#    captura errores de consola). Instalar una vez: npm i jsdom
#    Escena en: /tmp/opencode/e2e-interview.js  (patrón de referencia)
#    Stubs necesarios antes de parse: HTMLCanvasElement.getContext (Proxy noop) y matchMedia.

# 3. Harness de Node para módulos aislados (i18n, config, agent):
#    eval() del fichero con stubs de window/document/localStorage/fetch.

# 4. Servidores reales (prueba manual):
bash scripts/run-agent.sh     # :8080  — comprueba /v1/models y un POST a /v1/chat/completions
bash scripts/run-whisper.sh   # :8081  — comprueba /inference
```

### Gotchas de entorno (aprendidos a la manera dura)

- **Node ≥ 21**: `global.navigator` es getter solo-lectura; para stubbarlo hay que usar `Object.defineProperty(global, "navigator", {value, configurable:true})`. Una asignación plana se ignora en silencio y el stub "no existe".
- **jsdom con `file://`**: origen opaco → `localStorage` lanza `SecurityError` (artefacto; los navegadores reales sí lo permiten). Para probar modos que leen config, stubba `Config` directamente o inyecta localStorage en el `beforeParse`.
- **jsdom no tiene `fetch`** en algunas versiones: inyecta `window.fetch` en el `beforeParse` para probar la ruta remota.
- **Esta máquina**: `ollama.service` viene habilitado y retiene ~2 GB de VRAM; `sudo systemctl disable --now ollama` para liberarla. Whisper va a CPU (`:8081`) y el LLM a GPU (`:8080`) para no competir.

## 6. Bugfixes relevantes (histórico para no re-incidir)

1. **Selector de idioma muerto**: guard de `setLocale` indexaba STRINGS por idioma → siempre `return`. Fix: validar `"es"/"en"` explícitamente.
2. **Dropdown de micro vacío**: `app.js` sobreescribe `fields.load`; había que poblar `cfg-mic` en `loadSettingsIntoDrawer()` y persistir `micId` en el save inline.
3. **Entrevistador mudo en modo remoto**: `chat(messages, opts)` nunca incluía `messages` en el body → 400 → `""` → tarjeta vacía + TTS silenciado. Fix: signatura `chat(opts)`.
4. **Transcripción invisible en modo Whisper**: `afterAnswer` descartaba la tarjeta sin pintar el texto final (el camino Whisper no tiene onTick en vivo). Fix: pintar el texto antes de `lastUserLi = null`.
5. **STT vacío con whisper-server vivo**: MediaRecorder graba webm y el server solo descodifica WAV → error silencioso. Fix: conversión WAV en el navegador (y nunca `blob.arrayBuffer().slice(0)`: `arrayBuffer()` ya es promesa).
6. **Coach sesgado por el corpus**: el CV en castellano arrastraba la respuesta en inglés → corpus bilingüe + etiquetas/remind del idioma de salida; y volcado de CV en lugar de respuesta → esquema facts-first + guard anti-`%`.
7. **Micro «que no detecta nada» después de cambiar dispositivos/apps**: el `micId` guardado caduca (los navegadores rotan `deviceId` entre sesiones) → `getUserMedia({exact})` lanza `OverconstrainedError` para siempre; el test mostraba «acceso denegado» (falso) y la grabación fallaba EN SILENCIO (`start()` catch sin reportError). Fix: taxonomía de errores por `e.name` (`err_mic_busy`=NotReadableError, `err_mic_missing`, `err_mic_stale`=OverconstrainedError, `err_no_mic`=denegado), autocuración del micId caducado (validar contra `enumerateDevices` → clear + retry con default, en `openMicStream()` y en el `fill()` del dropdown), `onended` del track avisa `err_mic_lost`, y la grabación nunca falla sin toast.
8. **«No audio detected» con micro visible**: Firefox+PipeWire expone ~12 «Monitor of …» (loopbacks de salida) como `audioinput` y el guardado era uno de ellos → graba LO QUE SUENA DEL SISTEMA, silencio si nada reproduce (`rms=0.0000`). Además, Firefox RECUERDA el dispositivo elegido por origen (permiso per-site): `audio:true` también resolvía al monitor. Fix en la app: monitors filtrados del dropdown, validación PREVIA a abrir (`openMicStream` → `savedMicExists` cura monitor/caducado antes de `getUserMedia`), botón «Diagnóstico» en el drawer que imprime toda la cadena (inputs, probes gum, RMS + dispositivo), y el toast del test ahora dice QUÉ dispositivo ha grabado. La parte que la app no puede curar: el dispositivo recordado por Firefox por origen vive en MEMORIA DE SESIÓN (no en permissions.sqlite) — se limpia reiniciando Firefox o revocando el micro desde el icono del candado de la barra de direcciones y volviendo a elegir bien en la prompt.

## 7. Antes de decir que "está hecho"

- [ ] `node --check` limpio en todos los JS (+ `bash -n` en los scripts)
- [ ] E2E jsdom: tap de micro → aparece tarjeta de pregunta (builtin y, si puede, remoto)
- [ ] Nuevas claves i18n presentes en `es` y `en` (cross-ref de referencias)
- [ ] Ningún texto hardcoded nuevo en los HTML
- [ ] Probe manual abriendo `index.html` con doble clic (sin servidor)
