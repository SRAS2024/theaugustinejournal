/* Share button on post pages. */
(function () {
  "use strict";

  var btn = document.getElementById("shareBtn");
  if (!btn) return;
  var label = btn.querySelector("[data-i18n='share']");
  var postId = btn.getAttribute("data-post-id");

  function t(key, fallback) {
    var ui = window.__i18nUi || {};
    var lang = window.__i18nLang || "en";
    return (ui[key] && (ui[key][lang] || ui[key].en)) || fallback;
  }

  function trackShare() {
    fetch("/api/posts/" + encodeURIComponent(postId) + "/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).catch(function () {});
  }

  function flash(text) {
    if (!label) return;
    label.textContent = text;
    setTimeout(function () { label.textContent = t("share", "Share"); }, 2000);
  }

  function copyLink(url) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(url);
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = url;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(area);
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  btn.addEventListener("click", function () {
    var url = window.location.href.split("#")[0];
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).then(trackShare).catch(function () {});
      return;
    }
    copyLink(url)
      .then(function () {
        trackShare();
        flash(t("linkCopied", "Link copied!"));
      })
      .catch(function () {
        flash(t("copyFailed", "Could not copy the link"));
      });
  });
})();
