import time
import httpx
from app.models.market import Market, PricePoint

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"

# Simple in-memory cache: {cache_key: (timestamp, data)}
_cache: dict[str, tuple[float, list[Market]]] = {}
CACHE_TTL = 30  # seconds


def _cache_key(**kwargs) -> str:
    return str(sorted(kwargs.items()))


def _is_fresh(ts: float) -> bool:
    return time.time() - ts < CACHE_TTL


# Map frontend sort keys → Gamma API field names
_ORDER_MAP = {
    "volume24h": "volume24hr",
    "volume": "volume",
    "liquidity": "liquidity",
    "endDate": "end_date_iso",
}


async def fetch_markets(
    active: bool = True,
    closed: bool = False,
    limit: int = 20,
    offset: int = 0,
    order: str = "volume24hr",
    ascending: bool = False,
    tag_id: int | None = None,
) -> list[Market]:
    key = _cache_key(
        active=active, closed=closed, limit=limit,
        offset=offset, order=order, ascending=ascending, tag_id=tag_id,
    )
    if key in _cache:
        ts, data = _cache[key]
        if _is_fresh(ts):
            return data

    params: dict = {
        "active": str(active).lower(),
        "closed": str(closed).lower(),
        "limit": limit,
        "offset": offset,
        "order": _ORDER_MAP.get(order, order),
        "ascending": str(ascending).lower(),
    }
    if tag_id is not None:
        params["tag_id"] = tag_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{GAMMA_API}/markets", params=params)
        resp.raise_for_status()
        raw = resp.json()

    markets = [Market.model_validate(m) for m in raw]
    _cache[key] = (time.time(), markets)
    return markets


async def fetch_market(market_id: str) -> Market | None:
    key = f"market_{market_id}"
    if key in _cache:
        ts, data = _cache[key]
        if _is_fresh(ts):
            return data  # type: ignore

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{GAMMA_API}/markets/{market_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        market = Market.model_validate(resp.json())

    _cache[key] = (time.time(), market)  # type: ignore
    return market


async def fetch_price_history(
    token_id: str,
    interval: str = "max",
    fidelity: int = 60,
) -> list[PricePoint]:
    key = f"history_{token_id}_{interval}_{fidelity}"
    if key in _cache:
        ts, data = _cache[key]
        if _is_fresh(ts):
            return data  # type: ignore

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{CLOB_API}/prices-history",
            params={"market": token_id, "interval": interval, "fidelity": fidelity},
        )
        resp.raise_for_status()
        raw = resp.json().get("history", [])

    points = [PricePoint(t=p["t"], p=p["p"]) for p in raw]
    _cache[key] = (time.time(), points)  # type: ignore
    return points
