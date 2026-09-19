const MIN_RETRY_AFTER_SECONDS = 60;
// Mesmo limite do seletor de páginas da interface web.
const MAX_PAGES = 40;
const CRYPTOS_PER_PAGE = 250;
const RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });

function boundedInteger(rawValue, fallback, minimum, maximum) {
  const value = rawValue === null ? fallback : Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

function retryAfterSeconds(response) {
  const rawValue = response.headers.get("Retry-After");
  if (!rawValue) return MIN_RETRY_AFTER_SECONDS;
  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(numericValue));
  }
  const dateValue = Date.parse(rawValue);
  if (Number.isFinite(dateValue)) {
    return Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil((dateValue - Date.now()) / 1000));
  }
  return MIN_RETRY_AFTER_SECONDS;
}

function upstreamErrorMessage(status) {
  if (status === 400) return "A CoinGecko rejeitou os parâmetros da consulta.";
  if (status === 401) return "A chave Demo da CoinGecko configurada no Cloudflare é inválida ou não foi aceita.";
  if (status === 403) return "A CoinGecko bloqueou esta consulta.";
  if (status === 408) return "A consulta à CoinGecko expirou antes de ser concluída.";
  if (status === 429) return "Limite de requisições da CoinGecko atingido.";
  if (status >= 500) return "A CoinGecko está temporariamente indisponível.";
  return "A CoinGecko recusou a consulta.";
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const currency = (url.searchParams.get("currency") || "brl").toLowerCase();
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, MAX_PAGES);
    const perPage = CRYPTOS_PER_PAGE;
    if (!["brl", "usd", "eur"].includes(currency)) return json({ error: "Moeda inválida." }, 400);
    if (page === null) return json({ error: "Página inválida." }, 400);

    const secretKey = typeof context.env?.COINGECKO_API_KEY === "string"
      ? context.env.COINGECKO_API_KEY.trim()
      : "";
    if (!secretKey) {
      console.error(JSON.stringify({ event: "coingecko_key_missing" }));
      return json({ error: "A chave Demo da CoinGecko não está configurada no ambiente de produção do Cloudflare." }, 503);
    }

    const endpoint = new URL("https://api.coingecko.com/api/v3/coins/markets");
    endpoint.searchParams.set("vs_currency", currency);
    endpoint.searchParams.set("order", "market_cap_desc");
    endpoint.searchParams.set("per_page", String(perPage));
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("sparkline", "false");
    endpoint.searchParams.set("price_change_percentage", "24h");

    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "CryptoJSON-Studio/1.0",
        "x-cg-demo-api-key": secretKey,
      },
    });

    if (!response.ok) {
      const payload = {
        error: upstreamErrorMessage(response.status),
        status: response.status,
        upstream_status: response.status,
      };
      const extraHeaders = {};
      if (response.status === 429) {
        const retryAfter = retryAfterSeconds(response);
        payload.retry_after_seconds = retryAfter;
        extraHeaders["Retry-After"] = String(retryAfter);
      }
      console.warn(JSON.stringify({
        event: "coingecko_upstream_error",
        status: response.status,
        page,
        currency,
        perPage,
        hasApiKey: true,
      }));
      return json(payload, response.status, extraHeaders);
    }

    return new Response(response.body, { status: 200, headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error(JSON.stringify({
      event: "coingecko_proxy_error",
      message: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: "Falha temporária ao consultar os dados de mercado.", status: 502, upstream_status: null }, 502);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { allow: "GET, OPTIONS" } });
}
