/* Two-step confirmation (question, then administrative password) for
 * destructive admin actions: deleting a post or removing a subscriber.
 *
 * Trigger buttons carry:
 *   data-confirm-url      POST endpoint
 *   data-confirm-key      dictionary key of the question (may use {email})
 *   data-confirm-action   dictionary key of the confirm button label
 *   data-confirm-item     text shown under the question (optional)
 *   data-confirm-redirect where to go afterwards
 *   data-var-*            values for the question template
 */
(function () {
  "use strict";

  var confirmModal = document.getElementById("confirmModal");
  var passwordModal = document.getElementById("passwordModal");
  if (!confirmModal || !passwordModal) return;

  var message = document.getElementById("confirmModalMessage");
  var itemLabel = document.getElementById("confirmModalItem");
  var okBtn = document.getElementById("confirmModalOk");
  var passwordForm = document.getElementById("passwordForm");
  var passwordInput = document.getElementById("adminPasswordInput");
  var passwordError = document.getElementById("passwordError");
  var submitBtn = document.getElementById("confirmPasswordBtn");
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";
  var current = null;
  var busy = false;

  function t(key, vars) {
    if (window.__i18nT) return window.__i18nT(key, vars);
    var ui = window.__i18nUi || {};
    var text = (ui[key] && ui[key].en) || key;
    return text.replace(/\{(\w+)\}/g, function (m, name) { return vars && vars[name] !== undefined ? vars[name] : m; });
  }

  function open(modal) {
    modal.classList.add("active");
  }

  function close(modal) {
    modal.classList.remove("active");
  }

  function reset() {
    close(confirmModal);
    close(passwordModal);
    if (current && current.trigger) current.trigger.focus();
    current = null;
  }

  function showError(key) {
    passwordError.textContent = t(key);
    passwordError.style.display = "block";
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest && e.target.closest("[data-confirm-url]");
    if (!trigger) return;
    var vars = {};
    for (var i = 0; i < trigger.attributes.length; i++) {
      var a = trigger.attributes[i];
      if (a.name.indexOf("data-var-") === 0) vars[a.name.slice(9)] = a.value;
    }
    current = {
      trigger: trigger,
      url: trigger.getAttribute("data-confirm-url"),
      redirect: trigger.getAttribute("data-confirm-redirect") || window.location.pathname
    };
    message.textContent = t(trigger.getAttribute("data-confirm-key"), vars);
    itemLabel.textContent = trigger.getAttribute("data-confirm-item") || "";
    itemLabel.style.display = itemLabel.textContent ? "" : "none";
    okBtn.textContent = t(trigger.getAttribute("data-confirm-action") || "confirm");
    open(confirmModal);
    okBtn.focus();
  });

  document.getElementById("confirmModalCancel").addEventListener("click", reset);
  document.getElementById("cancelPasswordBtn").addEventListener("click", reset);

  okBtn.addEventListener("click", function () {
    close(confirmModal);
    passwordInput.value = "";
    passwordError.textContent = "";
    passwordError.style.display = "none";
    open(passwordModal);
    passwordInput.focus();
  });

  passwordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !current) return;
    var password = passwordInput.value;
    if (!password) {
      showError("incorrectPassword");
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    fetch(current.url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ password: password })
    })
      .then(function (res) {
        return res.json().then(
          function (data) { return { status: res.status, data: data }; },
          function () { return { status: res.status, data: null, redirected: res.redirected }; }
        );
      })
      .then(function (r) {
        if (r.data && r.data.success) {
          window.location.href = current.redirect;
          return;
        }
        if (r.status === 401) showError("incorrectPassword");
        else if (r.status === 403 || r.redirected || !r.data) showError("sessionExpired");
        else showError("actionFailed");
      })
      .catch(function () { showError("actionFailed"); })
      .then(function () {
        busy = false;
        submitBtn.disabled = false;
      });
  });

  [confirmModal, passwordModal].forEach(function (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) reset();
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && (confirmModal.classList.contains("active") || passwordModal.classList.contains("active"))) reset();
  });
})();
