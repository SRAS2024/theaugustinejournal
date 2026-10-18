// test/csrf.test.js
// Run: node --test test/csrf.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { csrfTokens, verifyCsrf, sameOriginJson } from "../src/middleware/csrf.js";

function run(mw, req) {
  return new Promise((resolve) => mw(req, {}, (err) => resolve(err || null)));
}

describe("admin CSRF tokens", () => {
  test("a token from the session verifies; others do not", async () => {
    const req = { session: {}, method: "GET" };
    await run(csrfTokens, req);
    const token = req.csrfToken();
    assert.ok(token.includes("."));

    const ok = { method: "POST", session: req.session, body: { _csrf: token }, get: () => undefined };
    assert.equal(await run(verifyCsrf, ok), null);

    const header = { method: "POST", session: req.session, body: {}, get: (h) => (h === "x-csrf-token" ? token : undefined) };
    assert.equal(await run(verifyCsrf, header), null);

    const bad = { method: "POST", session: req.session, body: { _csrf: token + "x" }, get: () => undefined };
    assert.equal((await run(verifyCsrf, bad))?.code, "EBADCSRFTOKEN");

    const other = { method: "POST", session: { csrfSecret: "different" }, body: { _csrf: token }, get: () => undefined };
    assert.equal((await run(verifyCsrf, other))?.code, "EBADCSRFTOKEN");
  });

  test("safe methods pass without a token", async () => {
    assert.equal(await run(verifyCsrf, { method: "GET", session: {}, get: () => undefined }), null);
  });
});

describe("sameOriginJson", () => {
  const req = (headers, json = true) => ({
    method: "POST",
    hostname: "theaugustinejournal.com",
    get: (h) => headers[h.toLowerCase()],
    is: () => json
  });

  test("accepts same-origin JSON", async () => {
    assert.equal(await run(sameOriginJson, req({ origin: "https://theaugustinejournal.com", "sec-fetch-site": "same-origin" })), null);
  });

  test("rejects cross-site requests and non-JSON bodies", async () => {
    assert.equal((await run(sameOriginJson, req({ origin: "https://evil.example" })))?.code, "EBADCSRFTOKEN");
    assert.equal((await run(sameOriginJson, req({ "sec-fetch-site": "cross-site" })))?.code, "EBADCSRFTOKEN");
    assert.equal((await run(sameOriginJson, req({ origin: "https://theaugustinejournal.com" }, false)))?.code, "EBADCSRFTOKEN");
  });
});
