import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../functions/api/markets.js", import.meta.url),
  "utf8",
);
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { onRequestGet } = await import(moduleUrl);

function makeContext(search = "", headers = {}) {
  return {
    request: new Request("https://example.com/api/markets" + search, {
      headers,
    }),
    env: { COINGECKO_API_KEY: headers["X-CoinGecko-Key"] || "demo-test-key" },
  };
}

async function withMockedFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = mock;
  console.warn = () => {};
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
}

test("forwards Retry-After and the upstream status on a 429", async () => {
  await withMockedFetch(
    async () =>
      new Response("{}", {
        status: 429,
        headers: { "Retry-After": "75" },
      }),
    async () => {
      const response = await onRequestGet(makeContext("?page=1"));
      const payload = await response.json();

      assert.equal(response.status, 429);
      assert.equal(response.headers.get("Retry-After"), "75");
      assert.equal(payload.upstream_status, 429);
      assert.equal(payload.retry_after_seconds, 75);
      assert.match(payload.error, /Limite de requisições/);
    },
  );
});

test("explains an invalid Demo key and preserves HTTP 401", async () => {
  await withMockedFetch(
    async () => new Response("{}", { status: 401 }),
    async () => {
      const response = await onRequestGet(makeContext("?page=1"));
      const payload = await response.json();

      assert.equal(response.status, 401);
      assert.equal(payload.upstream_status, 401);
      assert.match(payload.error, /chave Demo/);
    },
  );
});

test("rejects invalid pagination before contacting CoinGecko", async () => {
  let calls = 0;
  await withMockedFetch(
    async () => {
      calls += 1;
      return new Response("[]");
    },
    async () => {
      const response = await onRequestGet(makeContext("?page=41"));
      assert.equal(response.status, 400);
      assert.equal(calls, 0);
    },
  );
});

test("passes a session Demo key only in the upstream request", async () => {
  let upstreamHeaders;
  await withMockedFetch(
    async (_url, init) => {
      upstreamHeaders = init.headers;
      return new Response('[{"id":"bitcoin"}]', {
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const response = await onRequestGet(
        makeContext("?page=1", { "X-CoinGecko-Key": "demo-test-key" }),
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload[0].id, "bitcoin");
      assert.equal(upstreamHeaders["x-cg-demo-api-key"], "demo-test-key");
    },
  );
});


test("always requests 250 items per page", async () => {
  let upstreamUrl;
  await withMockedFetch(
    async (url) => {
      upstreamUrl = new URL(url);
      return new Response("[]");
    },
    async () => {
      const response = await onRequestGet(makeContext("?page=40&per_page=50"));
      assert.equal(response.status, 200);
      assert.equal(upstreamUrl.searchParams.get("per_page"), "250");
      assert.equal(upstreamUrl.searchParams.get("page"), "40");
    },
  );
});
