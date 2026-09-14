(function exposeCollectionPolicy(root, factory) {
  const policy = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = policy;
  }

  root.CollectionPolicy = policy;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCollectionPolicy() {
  "use strict";

  // CoinGecko Demo provides a stable 30 requests/minute limit.
  // Five seconds between pages keeps this collector comfortably below that ceiling.
  const MIN_PAGE_DELAY_SECONDS = 5;
  const BLOCK_DELAY_SECONDS = 15;
  const PAGES_PER_BLOCK = 4;
  const MAX_ATTEMPTS = 4;
  const MIN_RETRY_DELAY_SECONDS = 60;
  function normalizePageDelaySeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      return MIN_PAGE_DELAY_SECONDS;
    }
    return Math.max(MIN_PAGE_DELAY_SECONDS, Math.ceil(seconds));
  }

  function getWaitAfterPageSeconds(page, configuredDelaySeconds) {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new RangeError("A página deve ser um número inteiro positivo.");
    }

    const pageDelay = normalizePageDelaySeconds(configuredDelaySeconds);
    if (pageNumber % PAGES_PER_BLOCK === 0) {
      return Math.max(BLOCK_DELAY_SECONDS, pageDelay);
    }
    return pageDelay;
  }

  function getRetryDelaySeconds(retryAfterSeconds) {
    const seconds = Number(retryAfterSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return MIN_RETRY_DELAY_SECONDS;
    }
    return Math.max(MIN_RETRY_DELAY_SECONDS, Math.ceil(seconds));
  }

  return Object.freeze({
    MIN_PAGE_DELAY_SECONDS,
    BLOCK_DELAY_SECONDS,
    PAGES_PER_BLOCK,
    MAX_ATTEMPTS,
    MIN_RETRY_DELAY_SECONDS,
    normalizePageDelaySeconds,
    getWaitAfterPageSeconds,
    getRetryDelaySeconds,
  });
});
