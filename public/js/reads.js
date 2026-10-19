/* Read counting on post pages.
 *
 * Opening a post is not a read. A read is sent once the reader has spent the
 * post's reading time (data-read-seconds, 10–45 s by length) on the page
 * while it is visible, and has scrolled a little. A post too short to scroll
 * needs only the time. The device keeps a random id, in localStorage and in a
 * cookie (whichever survives restores the other), so it counts once per post.
 * A read lost to a network error or a busy server is sent again a few times
 * while the page is open; the server counts a ticket at most once.
 */
(function () {
  "use strict";

  var article = document.querySelector(".postContent[data-read-ticket]");
  if (!article || !window.fetch) return;

  // The signed ticket is "postId.issuedAt.tenths.nonce.signature" (src/lib/reads.js).
  var ticket = article.getAttribute("data-read-ticket") || "";
  var postId = ticket.split(".").slice(0, -4).join(".");
  var needMs = Number(article.getAttribute("data-read-seconds")) * 1000;
  if (!postId || !(needMs > 0)) return;

  var STORAGE_KEY = "taj.device";
  var COOKIE = "taj_did";
  var COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
  var MIN_SCROLL = 150;
  var RETRY_MS = [3000, 15000, 60000, 180000];
  var ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ── Device id ── */

  function storedId() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function cookieId() {
    try {
      var m = /(?:^|;\s*)taj_did=([^;]*)/.exec(document.cookie);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }

  function newId() {
    try {
      if (crypto.randomUUID) return crypto.randomUUID();
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = "";
      for (var i = 0; i < 16; i++) hex += (b[i] < 16 ? "0" : "") + b[i].toString(16);
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    } catch (e) { return null; }
  }

  function remember(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* storage blocked */ }
    try {
      document.cookie = COOKIE + "=" + id + "; Max-Age=" + COOKIE_MAX_AGE + "; Path=/; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) { /* cookies blocked */ }
  }

  /** The device id, or null when the browser cannot keep one (the server
   *  then recognises the device by its network address instead). */
  function deviceId() {
    var id = [storedId(), cookieId()].filter(function (v) { return v && ID_RE.test(v); })[0] || newId();
    if (!id) return null;
    remember(id);
    return storedId() === id || cookieId() === id ? id : null;
  }

  /* ── Sending ── */

  var retries = 0;

  /** Posts the read; again, later, after a network error, a 429 or a 5xx. */
  function post(body) {
    function again() {
      if (retries < RETRY_MS.length) setTimeout(function () { post(body); }, RETRY_MS[retries++]);
    }
    try {
      fetch("/api/posts/" + encodeURIComponent(postId) + "/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.status === 429 || res.status >= 500) again();
      }, again);
    } catch (e) { /* never break the page */ }
  }

  /* ── Reading time and scrolling ── */

  var visibleMs = 0;
  var visibleSince = null;
  var startY = window.pageYOffset || 0;
  var scrolled = 0;
  var timer = null;
  var sizeWatch = null;
  var sent = false;

  function now() { return Date.now(); }

  function timeOnPage() {
    return visibleMs + (visibleSince === null ? 0 : now() - visibleSince);
  }

  function scrollNeeded() {
    var doc = document.scrollingElement || document.documentElement;
    var distance = doc.scrollHeight - window.innerHeight;
    return distance < MIN_SCROLL ? 0 : Math.min(MIN_SCROLL, distance * 0.25);
  }

  function send() {
    sent = true;
    stop();
    var body = { ticket: ticket };
    var device = deviceId();
    if (device) body.device = device;
    post(body);
  }

  function check() {
    if (sent) return;
    if (timeOnPage() >= needMs && scrolled >= scrollNeeded()) send();
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (sent || visibleSince === null) return;
    var left = needMs - timeOnPage();
    timer = setTimeout(check, Math.max(0, left) + 50);
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      if (visibleSince === null) visibleSince = now();
    } else if (visibleSince !== null) {
      visibleMs += now() - visibleSince;
      visibleSince = null;
    }
    schedule();
    check();
  }

  function onScroll() {
    var moved = Math.abs((window.pageYOffset || 0) - startY);
    if (moved > scrolled) scrolled = moved;
    check();
  }

  function stop() {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", check);
    if (sizeWatch) sizeWatch.disconnect();
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", check, { passive: true });
  // The post can get shorter (e.g. once translated) and no longer need a scroll.
  if (window.ResizeObserver) {
    sizeWatch = new ResizeObserver(function () { check(); });
    sizeWatch.observe(article);
  }
  onVisibility();
})();
