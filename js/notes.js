/* =========================================================================
   VERBATIM · Session notes exporter — append-only markdown file
   Stores the accumulated turns in memory + localStorage (survives reloads).
   Each save downloads ENTREVISTA_{YYYYMMDD}.md with everything so far, so the
   on-disk file grows with every turn instead of being overwritten. Pure
   browser Blob download: no network, no build, works from file://.
   ========================================================================= */
(function () {
  "use strict";

  var LS_KEY = "entrevista_notes_v1";
  var _entries = [];
  var _loaded = false;

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /* ENTREVISTA_{ANY}{MES}{DIA} e.g. ENTREVISTA_20260910.md */
  function fileName() {
    var d = new Date();
    return "ENTREVISTA_" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".md";
  }

  function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (raw) { _entries = JSON.parse(raw) || []; }
    } catch (e) { /* memory only — never block the UI */ }
  }

  function persist() {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(_entries)); }
    catch (e) { /* ignore quota / security errors */ }
  }

  function entryExists(entry) {
    for (var i = 0; i < _entries.length; i++) {
      if (_entries[i].id === entry.id) return true;
    }
    return false;
  }

  /* Render the full accumulated document from the in-memory entries. */
  function render() {
    var out = "# ENTREVISTA · sessió guardada\n\n" +
             "Generat automàticament des de VERBATIM (apunt d'entrevista).\n\n---\n\n";
    _entries.forEach(function (e) {
      out += "## " + (e.ts ? e.ts : "") + "\n\n";
      out += "**Pregunta:**\n\n" + (e.q || "") + "\n\n";
      if (e.cv != null && e.cv !== "") {
        out += "**Resposta del Coach (CV):**\n\n" + e.cv + "\n\n";
      }
      if (e.general != null && e.general !== "") {
        out += "**Resposta del Coach (model):**\n\n" + e.general + "\n\n";
      }
      out += "---\n\n";
    });
    return out;
  }

  /* Blob download: replaces the dated file on disk with the latest content,
     so every turn appends rather than clobbering what came before. */
  function download() {
    var md = render();
    var blob = new Blob([md], { type: "text/mark;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 0);
    return fileName();
  }

  /* Deterministic identity for a turn: the interviewer's question text. Two
     saves of the same question are treated as one append (idempotent), so the
     on-disk file never grows duplicates within a day. */
  function entryId(question) {
    var base = encodeURIComponent((question || "").trim());
    if (!base) return "q-empty-" + (_entries.length + 1);
    var hash = 0;
    for (var i = 0; i < base.length; i++) { hash = (hash * 31 + base.charCodeAt(i)) | 0; }
    return "q:" + hash + ":" + base;
  }

  /* Save the current turn's question + coach answers. Returns true when this
     turn was newly recorded, false when it had already been saved this session
     (so the UI can show distinct feedback). Always re-downloads so the file on
     disk stays in sync with everything accumulated. */
  function saveTurn(q, cv, general) {
    load();
    var entry = {
      id: entryId(q),
      q: q || "",
      cv: cv || "",
      general: general || "",
      ts: new Date().toISOString().slice(0, 16).replace("T", " ")
    };
    var isNew = !entryExists(entry);
    if (isNew) { _entries.push(entry); persist(); }
    download();
    return isNew;
  }

  window.Notes = {
    saveTurn: saveTurn,
    render: render,
    download: download,
    fileName: fileName
  };
})();
