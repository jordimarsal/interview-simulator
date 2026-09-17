/* =========================================================================
   VERBATIM · Folder Context Reader
   Reads all text files from a user-selected local directory, aggregates
   their content, and exposes it as context for interview question generation.
   Works offline via file:// protocol using <input type="file" webkitdirectory>.
   ========================================================================= */
(function () {
  "use strict";

  let aggregatedContent = "";
  let fileCount = 0;
  let totalSize = 0;

  function reset() {
    aggregatedContent = "";
    fileCount = 0;
    totalSize = 0;
  }

  /* Recursively read all files in the selected directory/files list.
     Only processes text-like files (by extension). Returns Promise that
     resolves when all files have been read. */
  function processFiles(files) {
    return new Promise(function (resolve, reject) {
      if (!files || !files.length) { resolve(); return; }

      const TEXT_EXTENSIONS = [".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".log", ".html", ".htm", ".xml"];
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file max

      let processed = 0;
      let errors = [];

      Array.prototype.forEach.call(files, function (file) {
        if (file.isDirectory) {
          // Skip directories - only process files directly provided by webkitdirectory
          processed++;
          return;
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push("File too large: " + file.name);
          processed++;
          return;
        }

        // Check extension for text-like files
        const ext = "." + file.name.split(".").pop().toLowerCase();
        if (TEXT_EXTENSIONS.indexOf(ext) === -1 && file.type.indexOf("text/") !== 0) {
          // Not a recognized text type - skip silently
          processed++;
          return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const content = e.target.result;
            aggregatedContent += "\n\n=== " + file.name + " ===\n" + content;
            fileCount++;
            totalSize += file.size;
          } catch (err) {
            errors.push("Error reading " + file.name + ": " + err.message);
          } finally {
            processed++;
            if (processed >= files.length) {
              if (errors.length) console.warn("[folder-context]", errors.join("; "));
              resolve({ count: fileCount, size: totalSize });
            }
          }
        };
        reader.onerror = function () {
          errors.push("Read error: " + file.name);
          processed++;
          if (processed >= files.length) {
            resolve({ count: fileCount, size: totalSize });
          }
        };
        reader.readAsText(file);
      });
    });
  }

  /* Handle the folder picker input change event */
  function onFolderSelected(event) {
    reset();
    const files = event.target.files;
    return processFiles(files).then(function (stats) {
      window.dispatchEvent(new CustomEvent("folder-context-loaded", {
        detail: { count: stats.count, size: stats.size, hasContent: !!aggregatedContent }
      }));
      return stats;
    });
  }

  /* Get the aggregated content as a string suitable for LLM context */
  function getContent() {
    return aggregatedContent.trim();
  }

  /* Check if any content has been loaded */
  function hasContent() {
    return !!aggregatedContent;
  }

  /* Format content size in human-readable form */
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / (1024 * 1024)) + " MB";
  }

  // Expose public API
  window.FolderContext = {
    onFolderSelected: onFolderSelected,
    getContent: getContent,
    hasContent: hasContent,
    reset: reset,
    formatSize: formatSize
  };
})();