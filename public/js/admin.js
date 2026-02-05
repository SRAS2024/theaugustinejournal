(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const contentMode = document.getElementById("contentMode");
    const editorWrap = document.getElementById("editorWrap");
    const pdfWrap = document.getElementById("pdfWrap");

    function sync() {
      if (!contentMode) return;
      const mode = contentMode.value;
      if (mode === "PDF") {
        if (pdfWrap) pdfWrap.style.display = "block";
        if (editorWrap) editorWrap.style.display = "none";
      } else {
        if (pdfWrap) pdfWrap.style.display = "none";
        if (editorWrap) editorWrap.style.display = "block";
      }
    }

    if (contentMode) {
      contentMode.addEventListener("change", sync);
      sync();
    }
  });
})();
