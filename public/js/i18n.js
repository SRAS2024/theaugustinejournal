(function () {
  "use strict";

  var SITE_LANG = "en";

  /* ===== UI string translations (static labels) ===== */
  var ui = {
    home: { en: "Home", pt: "In\u00edcio", es: "Inicio", fr: "Accueil", de: "Startseite", it: "Home" },
    blog: { en: "Blog", pt: "Blog", es: "Blog", fr: "Blog", de: "Blog", it: "Blog" },
    essays: { en: "Essays", pt: "Ensaios", es: "Ensayos", fr: "Essais", de: "Essays", it: "Saggi" },
    essay: { en: "Essay", pt: "Ensaio", es: "Ensayo", fr: "Essai", de: "Essay", it: "Saggio" },
    letters: { en: "Letters", pt: "Cartas", es: "Cartas", fr: "Lettres", de: "Briefe", it: "Lettere" },
    letter: { en: "Letter", pt: "Carta", es: "Carta", fr: "Lettre", de: "Brief", it: "Lettera" },
    checkLatest: {
      en: "Check out our latest post",
      pt: "Confira nossa publica\u00e7\u00e3o mais recente",
      es: "Mira nuestra publicaci\u00f3n m\u00e1s reciente",
      fr: "D\u00e9couvrez notre derni\u00e8re publication",
      de: "Schauen Sie sich unseren neuesten Beitrag an",
      it: "Dai un'occhiata al nostro ultimo articolo"
    },
    noPostsYet: {
      en: "No posts yet.",
      pt: "Nenhuma publica\u00e7\u00e3o ainda.",
      es: "No hay publicaciones todav\u00eda.",
      fr: "Aucune publication pour le moment.",
      de: "Noch keine Beitr\u00e4ge.",
      it: "Nessun articolo ancora."
    },
    share: { en: "Share", pt: "Compartilhar", es: "Compartir", fr: "Partager", de: "Teilen", it: "Condividi" },
    viewPdf: {
      en: "View Original PDF",
      pt: "Ver PDF Original",
      es: "Ver PDF Original",
      fr: "Voir le PDF Original",
      de: "Original-PDF anzeigen",
      it: "Visualizza PDF Originale"
    }
  };

  /* ===== Language detection ===== */
  function getDeviceLang() {
    var lang = (navigator.language || navigator.userLanguage || "en")
      .toLowerCase()
      .split("-")[0];
    return lang;
  }

  /* ===== Translate static UI labels using built-in dictionaries ===== */
  function translateUiStrings(lang) {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n");
      var map = ui[key];
      if (!map) continue;
      el.textContent = map[lang] || map.en;
    }
  }

  /* ===== Google Translate cookie management ===== */
  function setTranslateCookies(lang) {
    var host = location.hostname;
    /* Clear existing googtrans cookies */
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=." + host;

    if (lang && lang !== SITE_LANG) {
      var val = "/en/" + lang;
      document.cookie = "googtrans=" + val + "; path=/";
      document.cookie = "googtrans=" + val + "; path=/; domain=." + host;
    }
  }

  /* ===== Programmatically trigger Google Translate ===== */
  function triggerGoogleTranslate(lang) {
    var attempts = 0;
    var maxAttempts = 80;
    var interval = setInterval(function () {
      attempts++;
      var combo = document.querySelector(".goog-te-combo");
      if (combo) {
        clearInterval(interval);
        combo.value = lang;
        combo.dispatchEvent(new Event("change"));
        /* Repeatedly hide the Google Translate banner */
        setTimeout(hideGoogleTranslateBanner, 300);
        setTimeout(hideGoogleTranslateBanner, 1000);
        setTimeout(hideGoogleTranslateBanner, 3000);
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);
  }

  function hideGoogleTranslateBanner() {
    /* Hide the top banner/frame that Google Translate injects */
    var frames = document.querySelectorAll(".goog-te-banner-frame");
    for (var i = 0; i < frames.length; i++) {
      frames[i].style.display = "none";
    }
    /* Ensure body stays at top (Google Translate pushes it down) */
    document.body.style.top = "0px";
  }

  /* ===== Initialize Google Translate Element ===== */
  function initGoogleTranslate(lang) {
    if (lang === SITE_LANG) return;

    setTranslateCookies(lang);

    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement(
        {
          pageLanguage: "en",
          autoDisplay: false,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        },
        "google_translate_element"
      );

      /* Programmatically trigger the target language */
      triggerGoogleTranslate(lang);
    };

    var script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.onerror = function () {
      console.warn("[i18n] Google Translate failed to load. Content will remain in English.");
    };
    document.head.appendChild(script);
  }

  /* ===== Translate dynamic content via the server API endpoint ===== */
  function translateDynamicContent(lang) {
    if (lang === SITE_LANG) return;

    var nodes = document.querySelectorAll("[data-translate='content']");
    if (!nodes.length) return;

    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var original = node.getAttribute("data-original") || "";
        if (!original.trim()) return;

        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, targetLang: lang })
        })
          .then(function (resp) { return resp.json(); })
          .then(function (data) {
            if (data && data.used && typeof data.translatedText === "string") {
              node.textContent = data.translatedText;
            }
          })
          .catch(function () { /* Silently fail; Google Translate will handle it */ });
      })(nodes[i]);
    }
  }

  /* ===== Set HTML lang attribute ===== */
  function setHtmlLang(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  /* ===== Init on DOMContentLoaded ===== */
  document.addEventListener("DOMContentLoaded", function () {
    var lang = getDeviceLang();

    /* Set HTML lang attribute */
    setHtmlLang(lang);

    /* Translate static UI strings from the built-in dictionary */
    translateUiStrings(lang);

    /* Attempt server-side API translation for marked dynamic content */
    translateDynamicContent(lang);

    /* Auto-translate the full page via Google Translate for non-English */
    initGoogleTranslate(lang);
  });
})();
