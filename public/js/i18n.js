(function () {
  "use strict";

  var STORAGE_KEY = "taj_preferred_lang";
  var SITE_LANG = "en";

  /* ===== Supported languages (displayed in selector) ===== */
  var languages = {
    en: "English",
    pt: "Portugu\u00eas",
    es: "Espa\u00f1ol",
    fr: "Fran\u00e7ais",
    de: "Deutsch",
    it: "Italiano",
    nl: "Nederlands",
    pl: "Polski",
    ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    ja: "\u65e5\u672c\u8a9e",
    ko: "\ud55c\uad6d\uc5b4",
    zh: "\u4e2d\u6587",
    ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    hi: "\u0939\u093f\u0928\u094d\u0926\u0940",
    tr: "T\u00fcrk\u00e7e",
    sv: "Svenska",
    da: "Dansk",
    no: "Norsk",
    fi: "Suomi",
    el: "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac",
    cs: "\u010ce\u0161tina",
    ro: "Rom\u00e2n\u0103",
    hu: "Magyar",
    uk: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430",
    th: "\u0e44\u0e17\u0e22",
    vi: "Ti\u1ebfng Vi\u1ec7t",
    id: "Bahasa Indonesia",
    ms: "Bahasa Melayu",
    tl: "Filipino",
    sw: "Kiswahili",
    he: "\u05e2\u05d1\u05e8\u05d9\u05ea"
  };

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
  function getPreferredLang() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && languages[stored]) return stored;

    var browserLang = (navigator.language || navigator.userLanguage || "en")
      .toLowerCase()
      .split("-")[0];
    return browserLang;
  }

  function setPreferredLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
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

  /* ===== Language selector UI ===== */
  function buildLanguageSelector() {
    var currentLang = getPreferredLang();
    var wrapper = document.getElementById("langSelector");
    if (!wrapper) return;

    /* Globe icon */
    var globeSvg =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M2 12h20"/>' +
      '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' +
      "</svg>";

    /* Toggle button */
    var btn = document.createElement("button");
    btn.className = "lang-toggle";
    btn.setAttribute("aria-label", "Change language");
    btn.setAttribute("type", "button");
    btn.innerHTML =
      globeSvg + ' <span class="lang-code">' + currentLang.toUpperCase() + "</span>";

    /* Dropdown */
    var dropdown = document.createElement("div");
    dropdown.className = "lang-dropdown";

    var keys = Object.keys(languages);
    for (var i = 0; i < keys.length; i++) {
      (function (code) {
        var item = document.createElement("a");
        item.href = "#";
        item.setAttribute("data-lang", code);
        item.textContent = languages[code];
        if (code === currentLang) item.classList.add("active");
        item.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          switchLanguage(code);
        });
        dropdown.appendChild(item);
      })(keys[i]);
    }

    /* Toggle dropdown */
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = wrapper.classList.contains("open");
      wrapper.classList.toggle("open", !isOpen);
    });

    /* Close on outside click */
    document.addEventListener("click", function () {
      wrapper.classList.remove("open");
    });

    /* Prevent dropdown clicks from closing */
    dropdown.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);
  }

  function switchLanguage(lang) {
    setPreferredLang(lang);
    setTranslateCookies(lang);
    /* Reload to let Google Translate pick up the new cookie */
    location.reload();
  }

  /* ===== Set HTML lang attribute ===== */
  function setHtmlLang(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  /* ===== Init on DOMContentLoaded ===== */
  document.addEventListener("DOMContentLoaded", function () {
    var lang = getPreferredLang();

    /* Set HTML lang attribute */
    setHtmlLang(lang);

    /* Build the language selector in the header */
    buildLanguageSelector();

    /* Translate static UI strings from the built-in dictionary */
    translateUiStrings(lang);

    /* Attempt server-side API translation for marked dynamic content */
    translateDynamicContent(lang);

    /* Auto-translate the full page via Google Translate for non-English */
    initGoogleTranslate(lang);
  });
})();
