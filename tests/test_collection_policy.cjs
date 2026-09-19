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

test("boots and rejects invalid page counts before collecting", async () => {
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
    document: { getElementById: (id) => elements[id], addEventListener: () => {}, removeEventListener: () => {} },
    navigator: {},
    Intl,
    URL,
    Blob,
    location: { origin: "https://example.com" },
    setTimeout,
  });

  assert.match(elements.limit.textContent, /40 páginas/);
  assert.equal(typeof listeners["generate:click"], "function");
  for (const value of ["", "0", "41", "1.5", "invalid"]) {
    elements.pages.value = value;
    await listeners["generate:click"]();
    assert.match(elements.error.textContent, /entre 1 e 40/);
  }
});

for (const pageCount of [1, 40]) test(`browser collects ${pageCount} selected pages without a cap floor`, async () => {
  const listeners = {};
  const elements = new Proxy(
    {
      currency: { value: "brl" },
      pages: { value: String(pageCount) },
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
  let fakeNow = 0;
  class MockDate extends Date {
    static now() { return (fakeNow += 1000); }
  }

  const context = {
    CollectionPolicy: policy,
    document: { getElementById: (id) => elements[id], addEventListener: () => {}, removeEventListener: () => {} },
    navigator: {},
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
    Date: MockDate,
    location: { origin: "https://example.com" },
    setTimeout: (callback, ms) => { if (ms === 0 || ms === 1000) callback(); return 0; },
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource, context);

  await listeners["generate:click"]();

  assert.equal(fetchCalls, pageCount);
  assert.equal(elements.totalMetric.textContent, String(pageCount === 1 ? 5 : pageCount + 3));
  assert.equal(elements.progressPct.textContent, "100%");
  assert.match(elements.progressMessage.textContent, new RegExp(`${pageCount} páginas`));
  assert.match(elements.tbody.innerHTML, /Above/);
  assert.match(elements.tbody.innerHTML, /Exact/);
  assert.match(elements.tbody.innerHTML, /Below/);
  assert.match(elements.tbody.innerHTML, /Missing/);
  const exported = vm.runInContext("exportCatalog()", context);
  assert.equal(exported.cryptos.length, pageCount === 1 ? 5 : pageCount + 3);
  assert.equal(exported.cryptos.filter(c => c.symbol === "UP").length, 2);
  assert.equal(new Set(exported.cryptos.map(c => c.id)).size, pageCount === 1 ? 5 : pageCount + 3);
});
