(function () {
  var toolbarOptions = [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["blockquote", "code-block"],
    ["link"],
    ["clean"]
  ];

  if (typeof Quill === "undefined") return;

  // PDF posts style paragraphs with pdf-indent, pdf-ref-entry and
  // pdf-ref-heading (see .pdf-text in styles.css). Quill drops classes it
  // does not know, so register them as block formats. Quill looks a class up
  // by everything before its last "-", hence two formats: "pdf" for
  // pdf-indent and "pdf-ref" for pdf-ref-entry / pdf-ref-heading.
  var Parchment = Quill.import("parchment");
  Quill.register(new Parchment.Attributor.Class("pdfindent", "pdf", {
    scope: Parchment.Scope.BLOCK,
    whitelist: ["indent"]
  }), true);
  Quill.register(new Parchment.Attributor.Class("pdfref", "pdf-ref", {
    scope: Parchment.Scope.BLOCK,
    whitelist: ["entry", "heading"]
  }), true);

  // Saved PDF content is wrapped in <div class="pdf-text">; Quill holds only
  // the paragraphs, the wrapper is put back on submit. Anything outside the
  // wrapper is kept.
  function unwrapPdfText(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var wrappers = tmp.querySelectorAll("div.pdf-text");
    for (var i = 0; i < wrappers.length; i++) {
      var wrapper = wrappers[i];
      while (wrapper.firstChild) wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
      wrapper.parentNode.removeChild(wrapper);
    }
    return tmp.innerHTML;
  }

  function hasText(editor) {
    return !!editor && editor.getText().trim().length > 0;
  }

  // Show the PDF formatting inside the editor too.
  function addEditorStyles() {
    var style = document.createElement("style");
    style.textContent =
      ".ql-editor .pdf-indent { text-indent: 2em; }" +
      ".ql-editor .pdf-ref-heading { text-align: center; }" +
      ".ql-editor .pdf-ref-entry { padding-left: 2.5em; text-indent: -2.5em; }";
    document.head.appendChild(style);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var editorEl = document.getElementById("quillEditor");
    var hiddenInput = document.getElementById("contentHtml");
    var contentMode = document.getElementById("contentMode");
    var pdfEditorWrap = document.getElementById("pdfEditorWrap");
    var quill = null;
    var pdfQuill = null;
    // Which editor the admin has typed in since the editors were last made
    // equal; admin.js uses it to carry edits across a content mode switch.
    var edited = { RICH: false, PDF: false };

    if (editorEl || document.getElementById("pdfQuillEditor")) addEditorStyles();

    // Initialize main editor
    if (editorEl && hiddenInput) {
      quill = new Quill("#quillEditor", {
        theme: "snow",
        modules: { toolbar: toolbarOptions }
      });

      var initial = hiddenInput.value || "";
      if (initial.trim()) {
        quill.clipboard.dangerouslyPasteHTML(unwrapPdfText(initial));
      }
      quill.on("text-change", function (_delta, _old, source) {
        if (source === "user") edited.RICH = true;
      });
    }

    // Initialize PDF editor
    var pdfEditorEl = document.getElementById("pdfQuillEditor");
    if (pdfEditorEl) {
      pdfQuill = new Quill("#pdfQuillEditor", {
        theme: "snow",
        modules: { toolbar: toolbarOptions }
      });

      // If editing an existing PDF post, load its content into the PDF editor
      if (contentMode && contentMode.value === "PDF" && hiddenInput) {
        var existingHtml = hiddenInput.value || "";
        if (existingHtml.trim()) {
          pdfQuill.clipboard.dangerouslyPasteHTML(unwrapPdfText(existingHtml));
        }
        // Keep the text editable even when the post has lost its PDF file.
        if (hasText(pdfQuill) && pdfEditorWrap) pdfEditorWrap.classList.add("visible");
      }
      pdfQuill.on("text-change", function (_delta, _old, source) {
        if (source === "user") edited.PDF = true;
      });
    }

    // Expose the editors so admin.js can insert extracted HTML and keep both
    // editors in step when the content mode changes.
    window._pdfQuill = pdfQuill;
    window._postEditors = { RICH: quill, PDF: pdfQuill, edited: edited, unwrapPdfText: unwrapPdfText };

    // On form submit, sync the correct editor's content into the hidden field
    var form = document.getElementById("postForm");
    if (form) {
      form.addEventListener("submit", function () {
        if (!hiddenInput) return;

        var mode = contentMode ? contentMode.value : "RICH";

        if (mode === "PDF" && pdfQuill) {
          // Re-add the wrapper the .pdf-text styles hang on.
          hiddenInput.value = hasText(pdfQuill)
            ? '<div class="pdf-text">' + pdfQuill.root.innerHTML + "</div>"
            : "";
        } else if (quill) {
          hiddenInput.value = quill.root.innerHTML;
        }
      });
    }
  });
})();
