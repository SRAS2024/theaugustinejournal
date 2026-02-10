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

  document.addEventListener("DOMContentLoaded", function () {
    var editorEl = document.getElementById("quillEditor");
    var hiddenInput = document.getElementById("contentHtml");
    var contentMode = document.getElementById("contentMode");
    var quill = null;
    var pdfQuill = null;

    // Initialize main editor
    if (editorEl && hiddenInput) {
      quill = new Quill("#quillEditor", {
        theme: "snow",
        modules: { toolbar: toolbarOptions }
      });

      var initial = hiddenInput.value || "";
      if (initial.trim()) {
        quill.clipboard.dangerouslyPasteHTML(initial);
      }
    }

    // Initialize PDF editor
    var pdfEditorEl = document.getElementById("pdfQuillEditor");
    if (pdfEditorEl) {
      pdfQuill = new Quill("#pdfQuillEditor", {
        theme: "snow",
        modules: { toolbar: toolbarOptions }
      });

      // Expose globally so admin.js can insert extracted HTML
      window._pdfQuill = pdfQuill;

      // If editing an existing PDF post, load its content into the PDF editor
      if (contentMode && contentMode.value === "PDF" && hiddenInput) {
        var existingHtml = hiddenInput.value || "";
        if (existingHtml.trim()) {
          // Strip pdf-text wrapper if present
          var tmp = document.createElement("div");
          tmp.innerHTML = existingHtml;
          var inner = tmp.querySelector(".pdf-text");
          pdfQuill.clipboard.dangerouslyPasteHTML(inner ? inner.innerHTML : existingHtml);
        }
      }
    }

    // On form submit, sync the correct editor's content into the hidden field
    var form = document.getElementById("postForm");
    if (form) {
      form.addEventListener("submit", function () {
        if (!hiddenInput) return;

        var mode = contentMode ? contentMode.value : "RICH";

        if (mode === "PDF" && pdfQuill) {
          hiddenInput.value = pdfQuill.root.innerHTML;
        } else if (quill) {
          hiddenInput.value = quill.root.innerHTML;
        }
      });
    }
  });
})();
