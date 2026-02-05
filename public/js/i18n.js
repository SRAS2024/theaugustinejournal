(function () {
  const ui = {
    home: { en: "Home", pt: "Início", es: "Inicio", fr: "Accueil" },
    blog: { en: "Blog", pt: "Blog", es: "Blog", fr: "Blog" },
    letters: { en: "Letters", pt: "Cartas", es: "Cartas", fr: "Lettres" },
    seeLatest: { en: "See our latest post", pt: "Veja nossa publicação mais recente", es: "Ver nuestra publicación más reciente", fr: "Voir notre publication la plus récente" }
  };

  function pickLang() {
    const lang = (navigator.language || "en").toLowerCase();
    if (lang.startsWith("pt")) return "pt";
    if (lang.startsWith("es")) return "es";
    if (lang.startsWith("fr")) return "fr";
    return "en";
  }

  function translateUi() {
    const lang = pickLang();
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const map = ui[key];
      if (!map) return;
      el.textContent = map[lang] || map.en;
    });
  }

  async function translateDynamicContent() {
    const targetLang = pickLang();
    const nodes = document.querySelectorAll("[data-translate='content']");
    if (!nodes.length) return;

    for (const node of nodes) {
      const original = node.getAttribute("data-original") || "";
      if (!original.trim()) continue;

      try {
        const resp = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, targetLang })
        });
        const data = await resp.json();
        if (data && data.used && typeof data.translatedText === "string") {
          node.textContent = data.translatedText;
        } else {
          node.textContent = original;
        }
      } catch {
        node.textContent = original;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    translateUi();
    translateDynamicContent();
  });
})();
