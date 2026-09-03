# AGENTS.md — VERBATIM · Voice Interview Simulator

> Document de context per a agents IA (i humans) que treballin en aquest projecte.
> Resumeix què és, com està fet, quins contractes no es poden trencar i com verificar els canvis.

## 1. Què és

Simulador d'entrevistes per veu en **castellà i anglès**: un agent entrevistador pregunta, el candidat respon parlant i un avaluador puntua cada resposta. **Autocontingut**: s'obre fent doble clic a `index.html` (protocool `file://`), sense build, sense CDN, sense frameworks, sense compte. Tot ha de funcionar offline en mode demo.

## 2. Estructura i rols

```
index.html          Landing + selector d'idioma (scripts: i18n, reveal)
interview.html      Sessió d'entrevista (tots els mòduls)
css/{main,landing,interview}.css
js/i18n.js          Strings bilingües + aplicació de locale + wire del selector
js/config.js        Config persistida (localStorage) + drawer de settings + veus/micròfons
js/questions.js     Banc de preguntes per idioma i tipus
js/speech.js        TTS (SpeechSynthesis) + STT (Web Speech | Whisper via MediaRecorder)
js/orb.js           Visualització canvas de l'orbe (estats idle/agent/listening/thinking)
js/agent.js         Entrevistador: mode 'builtin' (heurístic) | 'remote' (llama-server)
js/app.js           Orquestrador/màquina d'estats: IDLE→ASKING→RECORDING→THINKING→…
js/whisper-ui.js    Targeta de detecció del servidor Whisper + copia del comandament
js/agent-ui.js      Targeta de detecció del servidor de l'agent + nom del model carregat
js/reveal.js        Animacions d'entrada
```

Servidor de veu local (fora del repo): `~/ia/piper/server.py` + llançador `~/ia/run-piper.sh`
— POST `/tts {text, lang}` → WAV (es: `daniela-high`, en: `lessac-medium`).

## 3. Contractes que no es poden trencar

- **`file://` és ciutadania de primera**: cap mòdul pot dependre de http(s), CDN, workers o cookies. `fetch` a `localhost` és permès (llama-server envia CORS que reflecteix l'origen).
- **`i18n.STRINGS` està indexat per CLAU, no per idioma**: `STRINGS["nav_start"].es` — mai `STRINGS["es"]`. Aquesta confusió de forma ja va trencar el selector d'idioma una vegada.
- **`agent.js chat(opts)`** rep UN sol objecte `{messages, max_tokens, temperature, response_format}`. El body ha d'incloure `messages` sempre (un 400 silenciat es converteix en `""` → bombolla buida). Si una pregunta arriba buida, cal llançar error perquè `poseQuestion` mostri el fallback.
- **`app.js` sobreescriu `fields.load/save`** en cridar `Config.initDrawer(...)`: la ruta viva del drawer és `loadSettingsIntoDrawer()` i el `save` inline d'app.js. El que es cablegi a `config.js wireDrawer()` és codi mort si app.js no l'usa.
- **Permisos de micro**: els labels de `enumerateDevices()` arriben només després d'un `getUserMedia`. El desbloqueig es fa NOMÉS en obrir ⚙️ (`populateMics(sel, true)`), mai en carregar la pàgina.
- **Web Speech API no permet triar micròfon** (limitació de plataforma): la selecció (`micId`) només afecta la gravació Whisper (`deviceId: {exact}`).
- **Ports**: agent LLM `:8080` (`/v1/chat/completions`, `/v1/models`), Whisper `:8081` (`/inference`, POST multipart `file`+`language` → `{"text"}`), Piper TTS `:8082` (`/tts`, JSON `{text,lang}` → WAV). Llançadors idempotents: `~/ia/run-agent.sh`, `~/ia/run-whisper.sh`, `~/ia/run-piper.sh`.
- **Whisper sempre amb `language` forçat** (es/en): l'auto-detecció al·lucina en àudio marginal (anglès fantasma, `[BEEP]`, `[BLANK_AUDIO]`). El text de transcripció es neteja de marcadors no-verbals (`[...]`/`(...)`) abans de mostrar-se.
- **El whisper-server només descodifica WAV** (no està enllaçat amb ffmpeg): un POST webm/mp4 respon `{"error":"failed to read audio data"}`. Per això `speech.js` converteix la gravació de MediaRecorder a **WAV 16 kHz mono PCM16 al navegador** (`decodeAudioData` + `OfflineAudioContext` + `encodeWavPcm16`) abans de POSTar. No eliminar aquesta conversió.
- **Errors d'STT/TTS mai en silenci**: es superfícien via `window.Speech.onError(msg)` (app.js els mostra com a toast). Una resposta buida sense avís és un bug, no un comportament acceptable.
- **Copy bilingüe**: tot text nou va a `i18n.js` amb clau estable i entrades `es` + `en`. Sense textos hardcoded als HTML (usa `data-i18n`).

## 4. Estil de codi

- IIFE + `"use strict"`, ES5-ish (`function () {}`, sense classes ni mòduls ESM), globals exposats com `window.Modul`.
- Defensiu: res no llança sense capturar; degradació graceful (STT manual → editor en pantalla; error de LLM → fallback copy).
- Comentaris de capsulara per mòdul; dins del codi, només els que expliquen un "per què" no evident.
- Sense dependències externes de cap tipus. El que s'afegeix ha de seguir sent doble-clic-obrible.

## 5. Com verificar canvis

```bash
# 1. Sintaxi de tots els mòduls
for f in js/*.js; do node --check "$f"; done

# 2. E2E amb jsdom (carrega interview.html real, simula el tap del micro,
#    captura errors de consola). Instal·lar un cop: npm i jsdom
#    Escena a: /tmp/opencode/e2e-interview.js  (patró de referència)
#    Stubs necessaris abans de parse: HTMLCanvasElement.getContext (Proxy noop) i matchMedia.

# 3. Harness de Node per a mòduls aïllats (i18n, config, agent):
#    eval() del fitxer amb stubs de window/document/localStorage/fetch.

# 4. Servidors reals (prova manual):
~/ia/run-agent.sh     # :8080  — comprova /v1/models i un POST a /v1/chat/completions
~/ia/run-whisper.sh   # :8081  — comprova /inference
```

### Gotchas d'entorn (aprenguts a la manera dura)

- **Node ≥ 21**: `global.navigator` és getter només-lectura; per stubbar-lo cal `Object.defineProperty(global, "navigator", {value, configurable:true})`. Una assignació plana s'ignora en silenci i el stub "no existeix".
- **jsdom amb `file://`**: origen opac → `localStorage` llança `SecurityError` (artefacte; els navegadors reals sí el permeten). Per provar modes que llegeixen config, stubba `Config` directament o injecta localStorage al `beforeParse`.
- **jsdom no té `fetch`** en algunes versions: injecta `window.fetch` al `beforeParse` per provar la ruta remota.
- **Aquesta màquina**: `ollama.service` ve habilitat i reté ~2 GB de VRAM; `sudo systemctl disable --now ollama` per alliberar-la. Whisper va a CPU (`:8081`) i el LLM a GPU (`:8080`) per no competir.

## 6. Bugfixes rellevants (històric per no re-incidir)

1. **Selector d'idioma mort**: guard de `setLocale` indexava STRINGS per idioma → sempre `return`. Fix: validar `"es"/"en"` explícitament.
2. **Dropdown de micro buit**: `app.js` sobreescriu `fields.load`; calia poblar `cfg-mic` a `loadSettingsIntoDrawer()` i persistir `micId` al save inline.
3. **Entrevistador mut en mode remot**: `chat(messages, opts)` mai incloïa `messages` al body → 400 → `""` → targeta buida + TTS silenciat. Fix: signatura `chat(opts)`.

## 7. Abans de diu que "està fet"

- [ ] `node --check` net a tots els JS
- [ ] E2E jsdom: tap de micro → apareix targeta de pregunta (builtin i, si pot, remot)
- [ ] Noves claus i18n presents en `es` i `en` (cross-ref de referències)
- [ ] Cap text hardcoded nou als HTML
- [ ] Probe manual obrint `index.html` amb doble clic (sense servidor)
