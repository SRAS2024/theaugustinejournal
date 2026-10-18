/* Subscribe dialog (home page call-to-action and the bell button on posts). */
(function () {
  "use strict";

  var modal = document.getElementById("subscribeModal");
  if (!modal) return;

  var form = document.getElementById("subscribeModalBody");
  var titleEl = document.getElementById("subscribeModalTitle");
  var emailInput = document.getElementById("subscribeEmail");
  var errorEl = document.getElementById("subscribeError");
  var successEl = document.getElementById("subscribeSuccess");
  var submitBtn = document.getElementById("subscribeSubmit");
  var emailRegex = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
  var lastFocus = null;
  var busy = false;

  function t(key, fallback) {
    var ui = window.__i18nUi || {};
    var lang = window.__i18nLang || "en";
    return (ui[key] && (ui[key][lang] || ui[key].en)) || fallback;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }

  function openModal() {
    lastFocus = document.activeElement;
    titleEl.textContent = t("subscribe", "Subscribe");
    form.hidden = false;
    successEl.hidden = true;
    emailInput.value = "";
    errorEl.textContent = "";
    errorEl.style.display = "none";
    modal.hidden = false;
    modal.classList.add("active");
    setTimeout(function () { emailInput.focus(); }, 50);
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.hidden = true;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".subscribe-bell-btn, #subscribeCta")) {
      e.preventDefault();
      openModal();
    }
  });

  document.getElementById("subscribeCancel").addEventListener("click", closeModal);
  document.getElementById("subscribeClose").addEventListener("click", closeModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("active")) closeModal();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var email = emailInput.value.trim();
    if (!emailRegex.test(email)) {
      showError(t("invalidEmail", "Invalid email"));
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, language: window.__i18nLang || "en" })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data.success) {
          form.hidden = true;
          successEl.hidden = false;
          titleEl.textContent = t("subscribed", "Subscribed!");
          document.getElementById("subscribeClose").focus();
        } else if (data.duplicate) {
          showError(t("alreadySubscribed", "Oops! You are already subscribed"));
        } else if (data.error === "invalid_email") {
          showError(t("invalidEmail", "Invalid email"));
        } else {
          showError(t("somethingWentWrong", "Something went wrong. Please try again."));
        }
      })
      .catch(function () {
        showError(t("somethingWentWrong", "Something went wrong. Please try again."));
      })
      .then(function () {
        busy = false;
        submitBtn.disabled = false;
      });
  });
})();
