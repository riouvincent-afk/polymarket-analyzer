import time
import httpx
from app.models.market import Market

GAMMA_API = "https://gamma-api.polymarket.com"

# Simple in-memory cache: {cache_key: (timestamp, data)}
_cache: dict[str, tuple[float, list[Market]]] = {}
CACHE_TTL = 60  # seconds


def _cache_key(**kwargs) -> str:
    return str(sorted(kwargs.items()))


def _is_fresh(ts: float) -> bool:
    return time.time() - ts < CACHE_TTL


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
        "order": order,
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
