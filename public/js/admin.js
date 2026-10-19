(function () {
  var MAX_PDF_BYTES = 15 * 1024 * 1024; // same limit as the server

  // English text for the status messages; the dictionary in i18n.js has the
  // translations under the same keys.
  var FALLBACK = {
    pdfExtracting: "Extracting text from PDF…",
    pdfExtracted: "Text extracted. Edit the content below.",
    pdfReplacedKeptText: "PDF replaced. Existing content preserved.",
    pdfExtractFailed: "Failed to extract PDF text. Please try again.",
    pdfNoText: "No selectable text was found in this PDF.",
    pdfNotPdf: "Only PDF files can be uploaded.",
    pdfTooLarge: "The PDF is larger than 15 MB.",
    confirmSwitchToEditor: "Switching to Editor mode removes the original PDF from this post when you save. Continue?",
    autoFormatting: "Formatting…",
    autoFormatted: "Formatted. Press Ctrl+Z (⌘Z on a Mac) to undo.",
    autoFormatNoChange: "The formatting is already consistent.",
    autoFormatEmpty: "There is nothing to format yet.",
    autoFormatFailed: "The text could not be formatted. Please try again."
  };

  // Server error codes from /admin/posts/extract-pdf -> message keys.
  var ERROR_KEYS = {
    not_pdf: "pdfNotPdf",
    too_large: "pdfTooLarge",
    no_text: "pdfNoText"
  };

  function t(key) {
    var ui = window.__i18nUi || {};
    var lang = window.__i18nLang || "en";
    var entry = ui[key];
    return (entry && (entry[lang] || entry.en)) || FALLBACK[key] || key;
  }

  // CSRF token from the form (or the page's csrf-token meta tag)
  function csrfToken() {
    var input = document.querySelector('#postForm input[name="_csrf"]') || document.querySelector('input[name="_csrf"]');
    var meta = document.querySelector('meta[name="csrf-token"]');
    return input ? input.value : (meta ? meta.getAttribute("content") : "");
  }

  // "Auto format" under each editor: the server formats the editor's HTML the
  // way it is saved (src/lib/post-format.js) and the result replaces the
  // editor content as one change that Ctrl/Cmd+Z undoes.
  function setupAutoFormat(button) {
    var mode = button.getAttribute("data-auto-format");
    var status = document.querySelector('[data-auto-format-status="' + mode + '"]');
    function say(key, isError) {
      if (!status) return;
      status.textContent = t(key);
      status.classList.toggle("error", !!isError);
    }
    button.addEventListener("click", function () {
      var editors = window._postEditors;
      var editor = editors && editors[mode];
      if (!editor) return;
      if (!editor.getText().trim()) return say("autoFormatEmpty", false);
      var before = editor.root.innerHTML;
      button.disabled = true;
      say("autoFormatting", false);
      fetch("/admin/posts/format", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        credentials: "same-origin",
        body: JSON.stringify({ html: before })
      })
        .then(function (resp) {
          return resp.json().catch(function () { return {}; }).then(function (data) {
            if (!resp.ok || typeof data.html !== "string") throw new Error("Format failed");
            return data;
          });
        })
        .then(function (data) {
          // Typed into the editor while waiting: keep that, try again later.
          if (editor.root.innerHTML !== before) throw new Error("Edited meanwhile");
          // Its own undo step, never merged with typing just before or after.
          editor.history.cutoff();
          // Quill pastes into the format at the caret, so with the caret in a code
          // block the whole post would become code: empty the editor first (the two
          // changes are recorded as one step).
          editor.setContents([{ insert: "\n" }], "user");
          editor.clipboard.dangerouslyPasteHTML(editors.unwrapPdfText(data.html), "user");
          editor.history.cutoff();
          say(editor.root.innerHTML === before ? "autoFormatNoChange" : "autoFormatted", false);
        })
        .catch(function () {
          say("autoFormatFailed", true);
        })
        .then(function () {
          button.disabled = false;
        });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const contentMode = document.getElementById("contentMode");
    const editorWrap = document.getElementById("editorWrap");
    const pdfWrap = document.getElementById("pdfWrap");
    const pdfFileInput = document.getElementById("pdfFileInput");
    const pdfEditorWrap = document.getElementById("pdfEditorWrap");
    const pdfExtractStatus = document.getElementById("pdfExtractStatus");
    const pdfPathInput = document.getElementById("pdfPathInput");

    function hasPdf() {
      return !!(pdfPathInput && pdfPathInput.value);
    }

    function hasText(editor) {
      return !!editor && editor.getText().trim().length > 0;
    }

    function sync() {
      if (!contentMode) return;
      var mode = contentMode.value;
      if (mode === "PDF") {
        if (pdfWrap) pdfWrap.style.display = "block";
        if (editorWrap) editorWrap.style.display = "none";
        // Show PDF editor if content was already extracted (edit mode)
        if (pdfEditorWrap && (hasPdf() || hasText(window._pdfQuill))) {
          pdfEditorWrap.classList.add("visible");
        }
      } else {
        if (pdfWrap) pdfWrap.style.display = "none";
        if (editorWrap) editorWrap.style.display = "block";
      }
    }

    // Both editors hold the post body. When the mode changes, carry what the
    // admin edited over to the editor that will be saved, so switching never
    // silently drops edits. The PDF editor is only filled once a PDF is
    // attached; until then the upload fills it.
    function carryContent(from, to) {
      var editors = window._postEditors;
      if (!editors || from === to) return;
      var source = editors[from];
      var target = editors[to];
      if (!source || !target || !hasText(source)) return;
      if (to === "PDF" && !hasPdf()) return;
      if (editors.edited[from] || !hasText(target)) {
        target.setContents(source.getContents());
        editors.edited.RICH = false;
        editors.edited.PDF = false;
      }
    }

    function setStatus(key, isError) {
      if (!pdfExtractStatus) return;
      pdfExtractStatus.textContent = t(key);
      pdfExtractStatus.classList.toggle("error", !!isError);
    }

    if (contentMode) {
      var currentMode = contentMode.value;
      contentMode.addEventListener("change", function () {
        var mode = contentMode.value;
        // Saving a PDF post in Editor mode deletes its PDF on the server.
        if (currentMode === "PDF" && mode !== "PDF" && hasPdf() && !window.confirm(t("confirmSwitchToEditor"))) {
          contentMode.value = currentMode;
          return;
        }
        carryContent(currentMode, mode);
        currentMode = mode;
        sync();
      });
      sync();
    }

    document.querySelectorAll("[data-auto-format]").forEach(setupAutoFormat);

    // PDF file upload -> AJAX extraction
    if (pdfFileInput) {
      var requestId = 0;

      pdfFileInput.addEventListener("change", function () {
        var file = pdfFileInput.files[0];
        if (!file) return;

        // Checked here too so the admin gets an answer without uploading.
        if (!/\.pdf$/i.test(file.name)) {
          pdfFileInput.value = "";
          setStatus("pdfNotPdf", true);
          return;
        }
        if (file.size > MAX_PDF_BYTES) {
          pdfFileInput.value = "";
          setStatus("pdfTooLarge", true);
          return;
        }

        var titleInput = document.querySelector('input[name="title"]');
        var thisRequest = ++requestId;

        setStatus("pdfExtracting", false);

        var formData = new FormData();
        // The post title lets the server leave the PDF's own title out of the text.
        if (titleInput) formData.append("title", titleInput.value);
        formData.append("pdfFile", file);

        fetch("/admin/posts/extract-pdf", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken() },
          credentials: "same-origin",
          body: formData
        })
          .then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (data) {
              // Success is { html, filename, pdfPath }. A PDF without text may
              // come back as { html: "", code: "no_text", pdfPath }: the PDF is
              // kept and the admin is told there is no text to edit.
              var stored = data && typeof data.html === "string" && !data.error && (!data.code || data.pdfPath);
              if (!resp.ok || !stored) {
                var err = new Error("Extraction failed");
                err.code = data && data.code;
                throw err;
              }
              return data;
            });
          })
          .then(function (data) {
            // A newer file was chosen while this one was being read.
            if (thisRequest !== requestId) return;

            // Store the uploaded PDF path
            if (pdfPathInput) {
              pdfPathInput.value = data.pdfPath || "";
            }

            // Determine whether the editor is already visible and has content
            var pdfQuill = window._pdfQuill;
            var editorAlreadyVisible = pdfEditorWrap && pdfEditorWrap.classList.contains("visible");
            var editorHasContent = hasText(pdfQuill);

            // Show the PDF editor
            if (pdfEditorWrap) {
              pdfEditorWrap.classList.add("visible");
            }

            // Only auto-insert extracted text when the editor was not visible
            // yet or when it is visible but empty. If the editor already
            // contains text, preserve the existing content untouched.
            var kept = editorAlreadyVisible && editorHasContent;
            if (pdfQuill && !kept && data.html) {
              // Quill holds the paragraphs; the .pdf-text wrapper is re-added on submit.
              pdfQuill.clipboard.dangerouslyPasteHTML(window._postEditors.unwrapPdfText(data.html));
            }

            if (data.code === "no_text" || !data.html.replace(/<[^>]*>/g, "").trim()) setStatus("pdfNoText", true);
            else if (kept) setStatus("pdfReplacedKeptText", false);
            else setStatus("pdfExtracted", false);

            // Clear the file input so the form doesn't re-upload the file
            // (PDF is already on the server)
            pdfFileInput.value = "";
          })
          .catch(function (err) {
            if (thisRequest !== requestId) return;
            // Never leave a failed file selected: it would be uploaded again
            // with the form on Save, even in Editor mode.
            pdfFileInput.value = "";
            setStatus(ERROR_KEYS[err && err.code] || "pdfExtractFailed", true);
          });
      });
    }
  });
})();
