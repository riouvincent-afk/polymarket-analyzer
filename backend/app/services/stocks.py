"""
Stock market data service via yfinance.
All heavy computation runs in a thread pool to avoid blocking the event loop.
"""
from __future__ import annotations

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import httpx
import yfinance as yf

# ─── Thread pool & cache ─────────────────────────────────────────────────────
_executor = ThreadPoolExecutor(max_workers=30)
_cache: dict[str, tuple[object, float]] = {}
CACHE_TTL = 60  # seconds

# Per-symbol quote cache — so individual symbols benefit from any prior batch fetch
_quote_cache: dict[str, tuple[dict, float]] = {}
QUOTE_TTL = 300  # 5 minutes for stock prices


def _cache_get(key: str):
    if key in _cache:
        data, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


def _cache_set(key: str, data):
    _cache[key] = (data, time.time())
    return data


def _qcache_get(symbol: str) -> Optional[dict]:
    if symbol in _quote_cache:
        data, ts = _quote_cache[symbol]
        if time.time() - ts < QUOTE_TTL:
            return data
    return None


def _qcache_set(symbol: str, data: dict) -> dict:
    _quote_cache[symbol] = (data, time.time())
    return data


# ─── Quote helpers ────────────────────────────────────────────────────────────
def _fetch_quote_sync(symbol: str) -> Optional[dict]:
    """Fetch a single quote using yfinance fast_info (lightweight, no scraping)."""
    try:
        t = yf.Ticker(symbol)
        fi = t.fast_info

        last = getattr(fi, "last_price", None)
        if last is None or (isinstance(last, float) and last != last):  # NaN check
            return None

        prev = getattr(fi, "previous_close", None) or last
        change = last - prev
        pct = (change / prev * 100) if prev != 0 else 0.0

        def _f(attr, default=None):
            v = getattr(fi, attr, default)
            if v is None:
                return default
            try:
                f = float(v)
                return None if f != f else f  # NaN → None
            except (TypeError, ValueError):
                return default

        return {
            "symbol": symbol,
            "regularMarketPrice": round(last, 4),
            "regularMarketChange": round(change, 4),
            "regularMarketChangePercent": round(pct, 4),
            "regularMarketVolume": _f("three_month_average_volume"),
            "marketCap": _f("market_cap"),
            "currency": getattr(fi, "currency", "USD") or "USD",
            "exchange": getattr(fi, "exchange", "") or "",
            "dayHigh": _f("day_high"),
            "dayLow": _f("day_low"),
            "yearHigh": _f("year_high"),
            "yearLow": _f("year_low"),
            "marketState": "LIVE",
        }
    except Exception:
        return None


async def get_quotes(symbols: list[str]) -> list[dict]:
    """Parallel fetch quotes for multiple symbols, using per-symbol cache."""
    if not symbols:
        return []

    # Return hits immediately; only fetch what's stale/missing
    results: list[dict] = []
    to_fetch: list[str] = []
    for sym in symbols:
        hit = _qcache_get(sym)
        if hit is not None:
            results.append(hit)
        else:
            to_fetch.append(sym)

    if to_fetch:
        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(_executor, _fetch_quote_sync, sym) for sym in to_fetch]
        fetched = await asyncio.gather(*tasks)
        for sym, data in zip(to_fetch, fetched):
            if data is not None:
                _qcache_set(sym, data)
                results.append(data)

    return results


# ─── OHLC ─────────────────────────────────────────────────────────────────────
def _get_ohlc_sync(symbol: str, period: str, interval: str) -> list[dict]:
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period=period, interval=interval, auto_adjust=True)
        bars = []
        for ts, row in hist.iterrows():
            try:
                time_unix = int(ts.timestamp())
                bars.append({
                    "time": time_unix,
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": int(row.get("Volume", 0) or 0),
                })
            except Exception:
                continue
        return bars
    except Exception:
        return []


async def get_ohlc(symbol: str, period: str = "3mo", interval: str = "1d") -> list[dict]:
    key = f"ohlc:{symbol}:{period}:{interval}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(_executor, _get_ohlc_sync, symbol, period, interval)
    ttl = 300 if interval == "1d" else 60
    _cache[key] = (data, time.time() - CACHE_TTL + ttl)
    return data


# ─── Search ───────────────────────────────────────────────────────────────────
async def search_stocks(q: str) -> list[dict]:
    if len(q) < 2:
        return []
    key = f"search:{q.lower()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore

    url = (
        f"https://query1.finance.yahoo.com/v1/finance/search"
        f"?q={q}&quotesCount=12&newsCount=0&enableFuzzyQuery=false&lang=en-US&region=US"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, headers=headers)
        raw = r.json()
        results = [
            {
                "symbol": item.get("symbol", ""),
                "name": item.get("longname") or item.get("shortname") or item.get("symbol", ""),
                "exchange": item.get("exchDisp") or item.get("exchange", ""),
                "type": item.get("typeDisp") or item.get("quoteType", ""),
                "sector": "",
            }
            for item in raw.get("quotes", [])
            if item.get("symbol") and item.get("quoteType") in ("EQUITY", "ETF", "INDEX")
        ]
        return _cache_set(key, results)  # type: ignore
    except Exception:
        return []


# ─── Dividend info ────────────────────────────────────────────────────────────
def _get_dividend_info_sync(symbol: str) -> dict:
    try:
        t = yf.Ticker(symbol)
        info = t.info
        calendar = t.calendar

        next_date = None
        if isinstance(calendar, dict):
            nd = calendar.get("Ex-Dividend Date") or calendar.get("Dividend Date")
            if nd:
                try:
                    next_date = str(nd)[:10]
                except Exception:
                    pass

        return {
            "symbol": symbol,
            "dividendYield": info.get("dividendYield"),
            "dividendRate": info.get("dividendRate") or info.get("trailingAnnualDividendRate"),
            "exDividendDate": next_date,
            "payoutRatio": info.get("payoutRatio"),
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "shortName": info.get("shortName") or info.get("longName") or symbol,
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "country": info.get("country", ""),
        }
    except Exception:
        return {"symbol": symbol}


async def get_dividend_info(symbol: str) -> dict:
    key = f"div:{symbol}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(_executor, _get_dividend_info_sync, symbol)
    _cache[key] = (data, time.time() - CACHE_TTL + 3600)  # 1h TTL for dividends
    return data


# ─── Portfolio history ────────────────────────────────────────────────────────
def _get_ticker_history_sync(symbol: str, start: str) -> dict[str, float]:
    """Returns {date_str: close_price} for a ticker since start date."""
    try:
        t = yf.Ticker(symbol)
        hist = t.history(start=start, interval="1wk", auto_adjust=True)
        result = {}
        for ts, row in hist.iterrows():
            try:
                date_str = ts.date().isoformat()
                result[date_str] = float(row["Close"])
            except Exception:
                continue
        return result
    except Exception:
        return {}


async def get_portfolio_history(holdings: list[dict]) -> list[dict]:
    """
    holdings: [{ticker, qty, buyDate}, ...]
    Returns: [{time: "YYYY-MM-DD", value: float}] sorted by date.
    """
    if not holdings:
        return []

    earliest = min(h["buyDate"] for h in holdings)

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(_executor, _get_ticker_history_sync, h["ticker"], h["buyDate"])
        for h in holdings
    ]
    histories = await asyncio.gather(*tasks)

    from collections import defaultdict
    date_values: dict[str, float] = defaultdict(float)

    for holding, hist in zip(holdings, histories):
        qty = float(holding["qty"])
        buy_date = holding["buyDate"]
        for date_str, price in hist.items():
            if date_str >= buy_date:
                date_values[date_str] += qty * price

    return [{"time": k, "value": round(v, 2)} for k, v in sorted(date_values.items())]


# ─── Comprehensive stock info ─────────────────────────────────────────────────
def _clearbit_logo(website: str | None) -> str | None:
    """Derive Clearbit logo URL from a company's website domain."""
    if not website:
        return None
    try:
        domain = website.replace("https://", "").replace("http://", "").split("/")[0].strip()
        # Remove www. prefix — Clearbit works better with bare domains
        if domain.startswith("www."):
            domain = domain[4:]
        if domain:
            return f"https://logo.clearbit.com/{domain}"
    except Exception:
        pass
    return None


def _get_stock_info_sync(symbol: str) -> dict:
    try:
        t = yf.Ticker(symbol)
        info = t.info or {}

        def _v(key, default=None):
            val = info.get(key, default)
            if isinstance(val, float) and val != val:  # NaN
                return None
            return val

        officers = info.get("companyOfficers", [])
        ceo = next((o.get("name") for o in officers if "ceo" in (o.get("title","")).lower()), None)

        website = _v("website")

        # regularMarketChangePercent fallback: compute from fast_info if missing
        change_pct = _v("regularMarketChangePercent")
        if change_pct is None:
            try:
                fi = t.fast_info
                last = getattr(fi, "last_price", None)
                prev = getattr(fi, "previous_close", None)
                if last and prev and prev != 0:
                    change_pct = round((last - prev) / prev * 100, 4)
            except Exception:
                pass

        # regularMarketPrice fallback
        price = _v("regularMarketPrice") or _v("currentPrice")
        if price is None:
            try:
                fi = t.fast_info
                price = getattr(fi, "last_price", None)
            except Exception:
                pass

        return {
            "symbol": symbol,
            "shortName": _v("shortName"),
            "longName": _v("longName"),
            "longBusinessSummary": _v("longBusinessSummary"),
            "sector": _v("sector"),
            "industry": _v("industry"),
            "country": _v("country"),
            "city": _v("city"),
            "website": website,
            "logoUrl": _clearbit_logo(website),
            "fullTimeEmployees": _v("fullTimeEmployees"),
            "ceo": ceo,
            "trailingPE": _v("trailingPE"),
            "forwardPE": _v("forwardPE"),
            "priceToBook": _v("priceToBook"),
            "trailingEps": _v("trailingEps"),
            "dividendYield": _v("dividendYield"),
            "dividendRate": _v("dividendRate"),
            "payoutRatio": _v("payoutRatio"),
            "exDividendDate": _v("exDividendDate"),
            "debtToEquity": _v("debtToEquity"),
            "returnOnEquity": _v("returnOnEquity"),
            "returnOnAssets": _v("returnOnAssets"),
            "revenueGrowth": _v("revenueGrowth"),
            "earningsGrowth": _v("earningsGrowth"),
            "marketCap": _v("marketCap"),
            "beta": _v("beta"),
            "fiftyTwoWeekHigh": _v("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": _v("fiftyTwoWeekLow"),
            "regularMarketPrice": price,
            "regularMarketChangePercent": change_pct,
            "currency": _v("currency", "USD"),
            "exchange": _v("exchange"),
            "profitMargins": _v("profitMargins"),
            "grossMargins": _v("grossMargins"),
            "operatingMargins": _v("operatingMargins"),
            "currentRatio": _v("currentRatio"),
            "quickRatio": _v("quickRatio"),
            "totalRevenue": _v("totalRevenue"),
            "ebitda": _v("ebitda"),
            "freeCashflow": _v("freeCashflow"),
            "sharesOutstanding": _v("sharesOutstanding"),
        }
    except Exception:
        return {"symbol": symbol}


async def get_stock_info(symbol: str) -> dict:
    key = f"info:{symbol}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(_executor, _get_stock_info_sync, symbol)
    _cache[key] = (data, time.time() - CACHE_TTL + 3600)  # 1h TTL
    return data
