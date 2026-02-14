(function () {
  /* ===== UI string translations ===== */
  var ui = {
    home: { en: "Home", pt: "Inicio", es: "Inicio", fr: "Accueil", de: "Startseite", it: "Home" },
    blog: { en: "Blog", pt: "Blog", es: "Blog", fr: "Blog", de: "Blog", it: "Blog" },
    essays: { en: "Essays", pt: "Ensaios", es: "Ensayos", fr: "Essais", de: "Essays", it: "Saggi" },
    essay: { en: "Essay", pt: "Ensaio", es: "Ensayo", fr: "Essai", de: "Essay", it: "Saggio" },
    letters: { en: "Letters", pt: "Cartas", es: "Cartas", fr: "Lettres", de: "Briefe", it: "Lettere" },
    letter: { en: "Letter", pt: "Carta", es: "Carta", fr: "Lettre", de: "Brief", it: "Lettera" },
    checkLatest: {
      en: "Check out our latest post",
      pt: "Confira nossa publicacao mais recente",
      es: "Mira nuestra publicacion mas reciente",
      fr: "Decouvrez notre derniere publication",
      de: "Schauen Sie sich unseren neuesten Beitrag an",
      it: "Dai un'occhiata al nostro ultimo articolo"
    },
    noPostsYet: {
      en: "No posts yet.",
      pt: "Nenhuma publicacao ainda.",
      es: "No hay publicaciones todavia.",
      fr: "Aucune publication pour le moment.",
      de: "Noch keine Beitrage.",
      it: "Nessun articolo ancora."
    }
  };

  function getDeviceLang() {
    var lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    return lang.split("-")[0];
  }

  /* Translate static UI labels using built-in dictionaries */
  function translateUiStrings() {
    var lang = getDeviceLang();
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n");
      var map = ui[key];
      if (!map) continue;
      el.textContent = map[lang] || map.en;
    }
  }

  /* Translate dynamic content via the server API endpoint (if configured) */
  function translateDynamicContent() {
    var targetLang = getDeviceLang();
    if (targetLang === "en") return;

    var nodes = document.querySelectorAll("[data-translate='content']");
    if (!nodes.length) return;

    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var original = node.getAttribute("data-original") || "";
        if (!original.trim()) return;

        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, targetLang: targetLang })
        })
          .then(function (resp) {
            return resp.json();
          })
          .then(function (data) {
            if (data && data.used && typeof data.translatedText === "string") {
              node.textContent = data.translatedText;
            }
          })
          .catch(function () {});
      })(nodes[i]);
    }
  }

  /* Auto-translate the entire page via Google Translate Element */
  function initGoogleTranslate() {
    var lang = getDeviceLang();
    if (lang === "en") return;

    /* Set cookies so Google Translate auto-selects the language */
    var host = location.hostname;
    document.cookie = "googtrans=/en/" + lang + "; path=/";
    document.cookie = "googtrans=/en/" + lang + "; path=/; domain=." + host;

    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: lang,
          autoDisplay: false,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        },
        "google_translate_element"
      );
    };

    var script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }

  document.addEventListener("DOMContentLoaded", function () {
    translateUiStrings();
    translateDynamicContent();
    initGoogleTranslate();
  });
})();
