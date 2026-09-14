"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const policy = require("../collection-policy.js");

test("enforces at least 5 seconds between regular pages", () => {
  assert.equal(policy.normalizePageDelaySeconds(0), 5);
  assert.equal(policy.normalizePageDelaySeconds(4), 5);
  assert.equal(policy.normalizePageDelaySeconds(5), 5);
  assert.equal(policy.normalizePageDelaySeconds(45), 45);
});

test("waits 15 seconds after every block of four pages", () => {
  const waits = Array.from({ length: 8 }, (_, index) =>
    policy.getWaitAfterPageSeconds(index + 1, 5),
  );

  assert.deepEqual(waits, [5, 5, 5, 15, 5, 5, 5, 15]);
});

test("preserves a configured page delay longer than the block delay", () => {
  assert.equal(policy.getWaitAfterPageSeconds(1, 90), 90);
  assert.equal(policy.getWaitAfterPageSeconds(4, 90), 90);
});

test("honors Retry-After without retrying sooner than 60 seconds", () => {
  assert.equal(policy.getRetryDelaySeconds(undefined), 60);
  assert.equal(policy.getRetryDelaySeconds(15), 60);
  assert.equal(policy.getRetryDelaySeconds(75), 75);
});

test("boots the browser application with the shared collection policy", () => {
  const listeners = {};
  const elements = new Proxy(
    {
      limit: { textContent: "40 páginas de 250 criptos" },
      delay: { value: "0" },
    },
    {
      get(target, id) {
        if (!target[id]) {
          target[id] = {};
        }
        const element = target[id];
        element.classList ||= { toggle() {}, add() {} };
        element.addEventListener ||= (event, callback) => {
          listeners[id + ":" + event] = callback;
        };
        return element;
      },
    },
  );
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");

  vm.runInNewContext(appSource, {
    CollectionPolicy: policy,
    document: { getElementById: (id) => elements[id] },
    Intl,
    URL,
    Blob,
    location: { origin: "https://example.com" },
    setTimeout,
  });

  assert.match(elements.limit.textContent, /40 páginas/);
  assert.equal(typeof listeners["generate:click"], "function");
});

test("browser collects all 40 pages despite low caps, short and empty pages; deduplicates IDs", async () => {
  const listeners = {};
  const elements = new Proxy(
    {
      currency: { value: "brl" },
      limit: { textContent: "40 páginas de 250 criptos" },
    },
    {
      get(target, id) {
        if (!target[id]) target[id] = {};
        const element = target[id];
        element.classList ||= { toggle() {}, add() {} };
        element.style ||= {};
        element.addEventListener ||= (event, callback) => {
          listeners[id + ":" + event] = callback;
        };
        return element;
      },
    },
  );
  const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
  let fetchCalls = 0;

  const context = {
    CollectionPolicy: policy,
    document: { getElementById: (id) => elements[id] },
    fetch: async (url) => {
      fetchCalls += 1;
      assert.equal(Number(url.searchParams.get("page")), fetchCalls);
      assert.equal(url.searchParams.get("per_page"), "250");
      if (fetchCalls === 2) return new Response("[]");
      return new Response(JSON.stringify([
        { id: "above", symbol: "up", name: "Above", current_price: 10, market_cap: 1_500_000 },
        { id: "exact", symbol: "eq", name: "Exact", current_price: 5, market_cap: 1_000_000 },
        { id: "below", symbol: "up", name: "Below", current_price: 1, market_cap: 999_999 },
        { id: "missing", symbol: "missing", name: "Missing", current_price: 1, market_cap: null },
        { id: "page-" + fetchCalls, symbol: "p", name: "Page " + fetchCalls, current_price: 1, market_cap: 0 },
      ]));
    },
    Response,
    AbortController,
    Intl,
    URL,
    Blob,
    location: { origin: "https://example.com" },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, ms) => ms === 1000 ? (callback(), 0) : 0,
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource, context);

  await listeners["generate:click"]();

  assert.equal(fetchCalls, 40);
  assert.equal(elements.totalMetric.textContent, "43");
  assert.equal(elements.progressPct.textContent, "100%");
  assert.match(elements.progressMessage.textContent, /40 páginas/);
  assert.match(elements.tbody.innerHTML, /Above/);
  assert.match(elements.tbody.innerHTML, /Exact/);
  assert.match(elements.tbody.innerHTML, /Below/);
  assert.match(elements.tbody.innerHTML, /Missing/);
  const exported = vm.runInContext("exportCatalog()", context);
  assert.equal(exported.cryptos.length, 43);
  assert.equal(exported.cryptos.filter(c => c.symbol === "UP").length, 2);
  assert.equal(new Set(exported.cryptos.map(c => c.id)).size, 43);
});
