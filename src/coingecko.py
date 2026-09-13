"""Cliente resiliente para o endpoint de mercados da CoinGecko."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from math import ceil
from typing import Any

import requests

API_URL = "https://api.coingecko.com/api/v3/coins/markets"
SUPPORTED_CURRENCIES = {"brl", "usd", "eur"}
PAGES_PER_BLOCK = 4
RETRY_DELAY_SECONDS = 10.0
RATE_LIMIT_DELAY_SECONDS = 60.0
BLOCK_DELAY_SECONDS = 60.0
MAX_PAGES = 40
CRYPTOS_PER_PAGE = 250


class CoinGeckoError(RuntimeError):
    """Erro amigável ocorrido durante a coleta."""


@dataclass(frozen=True)
class FetchProgress:
    page: int
    collected: int
    message: str
    wait_seconds: int | None = None
    wait_label: str | None = None


ProgressCallback = Callable[[FetchProgress], None]


def _wait_with_countdown(
    seconds: float,
    *,
    page: int,
    collected: int,
    label: str,
    progress_callback: ProgressCallback | None,
) -> None:
    """Aguarda o intervalo informando, a cada segundo, quanto tempo ainda resta."""
    remaining = ceil(seconds)
    while remaining > 0:
        if progress_callback:
            progress_callback(
                FetchProgress(
                    page,
                    collected,
                    f"{label}: {remaining} segundo{'s' if remaining != 1 else ''}.",
                    wait_seconds=remaining,
                    wait_label=label,
                )
            )
        time.sleep(1)
        remaining -= 1


class CoinGeckoClient:
    """Cliente HTTP com timeout, repetição e suporte à chave Demo."""

    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: float = 30.0,
        max_retries: int = 5,
        session: requests.Session | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "CryptoJSON-Studio/1.0",
            }
        )
        if api_key:
            self.session.headers["x-cg-demo-api-key"] = api_key.strip()

    def fetch_markets(
        self,
        *,
        currency: str = "brl",
        pages: int = 4,
        per_page: int = 250,
        delay_seconds: float = 30.0,
        block_delay_seconds: float = BLOCK_DELAY_SECONDS,
        progress_callback: ProgressCallback | None = None,
    ) -> list[dict[str, Any]]:
        """Coleta páginas em blocos, repetindo falhas e preservando resultados parciais."""
        currency = currency.lower()
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Moeda não suportada: {currency}")
        if not 1 <= pages <= MAX_PAGES:
            raise ValueError(f"O total de páginas deve ficar entre 1 e {MAX_PAGES}.")
        if per_page != CRYPTOS_PER_PAGE:
            raise ValueError(f"O total por página deve ser exatamente {CRYPTOS_PER_PAGE}.")
        if pages > 1 and delay_seconds < 30:
            raise ValueError("O intervalo entre páginas deve ser de pelo menos 30 segundos.")
        if block_delay_seconds < BLOCK_DELAY_SECONDS:
            raise ValueError("O intervalo entre blocos deve ser de pelo menos 60 segundos.")

        collected: list[dict[str, Any]] = []
        for page in range(1, pages + 1):
            if progress_callback:
                progress_callback(FetchProgress(page, len(collected), f"Consultando a página {page}…"))
            params = {
                "vs_currency": currency,
                "order": "market_cap_desc",
                "per_page": per_page,
                "page": page,
                "sparkline": "false",
                "price_change_percentage": "24h",
                "locale": "pt",
            }
            page_items: list[Any] | None = None
            for attempt in range(1, self.max_retries + 1):
                try:
                    response = self.session.get(API_URL, params=params, timeout=self.timeout_seconds)
                    if response.status_code == 429:
                        if progress_callback:
                            progress_callback(
                                FetchProgress(
                                    page,
                                    len(collected),
                                    f"Limite da CoinGecko na página {page}. Tentativa {attempt}/{self.max_retries}; aguardando 60 segundos…",
                                )
                            )
                        if attempt < self.max_retries:
                            time.sleep(RATE_LIMIT_DELAY_SECONDS)
                        continue
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, list):
                        raise TypeError("A CoinGecko retornou dados em um formato inesperado.")
                    page_items = payload
                    break
                except (requests.RequestException, requests.JSONDecodeError, TypeError) as exc:
                    if progress_callback:
                        progress_callback(
                            FetchProgress(
                                page,
                                len(collected),
                                f"Falha na página {page}, tentativa {attempt}/{self.max_retries}: {exc}",
                            )
                        )
                    if attempt < self.max_retries:
                        time.sleep(RETRY_DELAY_SECONDS)

            if page_items is None:
                if progress_callback:
                    progress_callback(
                        FetchProgress(page, len(collected), f"Página {page} ignorada após {self.max_retries} tentativas.")
                    )
            elif not page_items:
                if progress_callback:
                    progress_callback(FetchProgress(page, len(collected), f"Página {page} retornou vazia; prosseguindo."))
            else:
                collected.extend(item for item in page_items if isinstance(item, dict))
                if progress_callback:
                    progress_callback(FetchProgress(page, len(collected), f"Página {page} concluída."))

            if page < pages:
                _wait_with_countdown(
                    delay_seconds,
                    page=page,
                    collected=len(collected),
                    label="Intervalo entre páginas",
                    progress_callback=progress_callback,
                )
                if page % PAGES_PER_BLOCK == 0:
                    _wait_with_countdown(
                        block_delay_seconds,
                        page=page,
                        collected=len(collected),
                        label=f"Pausa após bloco de {PAGES_PER_BLOCK} páginas",
                        progress_callback=progress_callback,
                    )

        return collected
