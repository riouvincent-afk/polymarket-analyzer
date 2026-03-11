from fastapi import APIRouter, HTTPException, Query
from app.models.market import MarketResponse, MarketsListResponse, PriceHistoryResponse
from app.services import polymarket as svc

router = APIRouter()


@router.get("", response_model=MarketsListResponse)
async def list_markets(
    active: bool = Query(True, description="Filter active markets"),
    closed: bool = Query(False, description="Filter closed markets"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    order: str = Query("volume24hr", description="Sort field: volume24hr, volume, liquidity, endDate"),
    ascending: bool = Query(False),
    tag_id: int | None = Query(None, description="Filter by tag ID"),
):
    markets = await svc.fetch_markets(
        active=active,
        closed=closed,
        limit=limit,
        offset=offset,
        order=order,
        ascending=ascending,
        tag_id=tag_id,
    )
    return MarketsListResponse(
        markets=[MarketResponse.from_market(m) for m in markets],
        total=len(markets),
        limit=limit,
        offset=offset,
    )


@router.get("/{market_id}", response_model=MarketResponse)
async def get_market(market_id: str):
    market = await svc.fetch_market(market_id)
    if market is None:
        raise HTTPException(status_code=404, detail="Market not found")
    return MarketResponse.from_market(market)


@router.get("/{market_id}/history", response_model=PriceHistoryResponse)
async def get_market_history(
    market_id: str,
    interval: str = Query("max", description="1d, 1w, 1m, 6m, max"),
    fidelity: int = Query(60, description="Data point interval in minutes"),
):
    market = await svc.fetch_market(market_id)
    if market is None:
        raise HTTPException(status_code=404, detail="Market not found")
    if not market.clobTokenIds:
        raise HTTPException(status_code=404, detail="No price data available for this market")

    token_id = market.clobTokenIds[0]
    history = await svc.fetch_price_history(token_id, interval=interval, fidelity=fidelity)
    return PriceHistoryResponse(token_id=token_id, history=history, interval=interval)
