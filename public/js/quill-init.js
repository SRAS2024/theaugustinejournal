(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const editorEl = document.getElementById("quillEditor");
    const hiddenInput = document.getElementById("contentHtml");
    if (!editorEl || !hiddenInput) return;

    const quill = new Quill("#quillEditor", {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "code-block"],
          ["link"],
          ["clean"]
        ]
      }
    });

    const initial = hiddenInput.value || "";
    if (initial.trim()) {
      quill.clipboard.dangerouslyPasteHTML(initial);
    }

    const form = document.getElementById("postForm");
    if (form) {
      form.addEventListener("submit", () => {
        hiddenInput.value = quill.root.innerHTML;
      });
    }
  });
})();
