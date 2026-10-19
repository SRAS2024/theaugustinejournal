// public/js/admin-nav.js
// On phones the admin navigation scrolls sideways; keep the link or button
// that has keyboard focus in view.
(function () {
  "use strict";
  var nav = document.querySelector(".admin-nav");
  if (!nav) return;
  nav.addEventListener("focusin", function (e) {
    if (e.target && e.target.scrollIntoView) e.target.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
})();
