(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const contentMode = document.getElementById("contentMode");
    const editorWrap = document.getElementById("editorWrap");
    const pdfWrap = document.getElementById("pdfWrap");
    const pdfFileInput = document.getElementById("pdfFileInput");
    const pdfEditorWrap = document.getElementById("pdfEditorWrap");
    const pdfExtractStatus = document.getElementById("pdfExtractStatus");
    const pdfPathInput = document.getElementById("pdfPathInput");

    function sync() {
      if (!contentMode) return;
      var mode = contentMode.value;
      if (mode === "PDF") {
        if (pdfWrap) pdfWrap.style.display = "block";
        if (editorWrap) editorWrap.style.display = "none";
        // Show PDF editor if content was already extracted (edit mode)
        if (pdfPathInput && pdfPathInput.value && pdfEditorWrap) {
          pdfEditorWrap.classList.add("visible");
        }
      } else {
        if (pdfWrap) pdfWrap.style.display = "none";
        if (editorWrap) editorWrap.style.display = "block";
      }
    }

    if (contentMode) {
      contentMode.addEventListener("change", sync);
      sync();
    }

    // PDF file upload -> AJAX extraction
    if (pdfFileInput) {
      pdfFileInput.addEventListener("change", function () {
        var file = pdfFileInput.files[0];
        if (!file) return;

        // Get CSRF token from the form
        var csrfInput = document.querySelector('input[name="_csrf"]');
        var csrfToken = csrfInput ? csrfInput.value : "";

        if (pdfExtractStatus) {
          pdfExtractStatus.textContent = "Extracting text from PDF...";
          pdfExtractStatus.classList.remove("error");
        }

        var formData = new FormData();
        formData.append("pdfFile", file);
        formData.append("_csrf", csrfToken);

        fetch("/admin/posts/extract-pdf?_csrf=" + encodeURIComponent(csrfToken), {
          method: "POST",
          body: formData
        })
          .then(function (resp) {
            if (!resp.ok) throw new Error("Extraction failed");
            return resp.json();
          })
          .then(function (data) {
            if (data.error) {
              if (pdfExtractStatus) {
                pdfExtractStatus.textContent = data.error;
                pdfExtractStatus.classList.add("error");
              }
              return;
            }

            // Store the uploaded PDF path
            if (pdfPathInput) {
              pdfPathInput.value = data.pdfPath || "";
            }

            // Determine whether the editor is already visible and has content
            var editorAlreadyVisible = pdfEditorWrap && pdfEditorWrap.classList.contains("visible");
            var editorHasContent = window._pdfQuill && window._pdfQuill.getText().trim().length > 0;

            // Show the PDF editor
            if (pdfEditorWrap) {
              pdfEditorWrap.classList.add("visible");
            }

            // Only auto-insert extracted text when the editor was not visible
            // yet or when it is visible but empty. If the editor already
            // contains text, preserve the existing content untouched.
            if (window._pdfQuill && (!editorAlreadyVisible || !editorHasContent)) {
              // Strip the pdf-text wrapper div if present — inject plain paragraphs
              var html = data.html || "";
              var tmp = document.createElement("div");
              tmp.innerHTML = html;
              var inner = tmp.querySelector(".pdf-text");
              window._pdfQuill.clipboard.dangerouslyPasteHTML(inner ? inner.innerHTML : html);
            }

            if (pdfExtractStatus) {
              pdfExtractStatus.textContent = (editorAlreadyVisible && editorHasContent)
                ? "PDF replaced. Existing content preserved."
                : "Text extracted. Edit the content below.";
              pdfExtractStatus.classList.remove("error");
            }

            // Clear the file input so the form doesn't re-upload the file
            // (PDF is already on the server)
            pdfFileInput.value = "";
          })
          .catch(function (err) {
            if (pdfExtractStatus) {
              pdfExtractStatus.textContent = "Failed to extract PDF text. Please try again.";
              pdfExtractStatus.classList.add("error");
            }
          });
      });
    }
  });
})();
