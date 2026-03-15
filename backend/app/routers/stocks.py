"""
Stock market routes — powered by yfinance.
All routes proxied from Next.js via the catch-all /api/[[...path]] handler.
"""
from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.services import stocks as svc

router = APIRouter()


# ─── Quotes ──────────────────────────────────────────────────────────────────
@router.get("/quotes")
async def get_quotes(symbols: str = Query(..., description="Comma-separated ticker symbols")):
    """
    GET /api/stocks/quotes?symbols=AAPL,MSFT,^GSPC
    Returns a list of live quote objects.
    """
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="No symbols provided")
    if len(syms) > 50:
        raise HTTPException(status_code=400, detail="Max 50 symbols per request")
    return await svc.get_quotes(syms)


# ─── OHLC ─────────────────────────────────────────────────────────────────────
@router.get("/ohlc/{symbol}")
async def get_ohlc(
    symbol: str,
    interval: str = Query("1d", description="1m,5m,15m,1h,1d,1wk,1mo"),
    period: str = Query("3mo", description="1d,5d,1mo,3mo,6mo,1y,2y,5y,max"),
):
    """
    GET /api/stocks/ohlc/AAPL?interval=1d&period=3mo
    Returns OHLCBar[] with time in UTC seconds.
    """
    data = await svc.get_ohlc(symbol.upper(), period=period, interval=interval)
    return data


# ─── Search ───────────────────────────────────────────────────────────────────
@router.get("/search")
async def search(q: str = Query(..., min_length=2, description="Search query")):
    """
    GET /api/stocks/search?q=NV
    Returns [{symbol, name, exchange, type}]
    """
    return await svc.search_stocks(q)


# ─── Dividend info ────────────────────────────────────────────────────────────
@router.get("/dividends/{symbol}")
async def get_dividends(symbol: str):
    """
    GET /api/stocks/dividends/AAPL
    Returns dividend yield, rate, next ex-date, PE ratios.
    """
    return await svc.get_dividend_info(symbol.upper())


# ─── Comprehensive stock info ─────────────────────────────────────────────────
@router.get("/info/{symbol}")
async def get_stock_info(symbol: str):
    """
    GET /api/stocks/info/AAPL
    Returns comprehensive company info, ratios, metadata.
    """
    return await svc.get_stock_info(symbol.upper())


# ─── Portfolio history ────────────────────────────────────────────────────────
class HoldingIn(BaseModel):
    ticker: str
    qty: float
    buyDate: str  # ISO date "YYYY-MM-DD"


class PortfolioHistoryRequest(BaseModel):
    holdings: list[HoldingIn]


@router.post("/portfolio-history")
async def portfolio_history(body: PortfolioHistoryRequest):
    """
    POST /api/stocks/portfolio-history
    Body: {holdings: [{ticker, qty, buyDate}]}
    Returns [{time: "YYYY-MM-DD", value: float}]
    """
    holdings = [{"ticker": h.ticker.upper(), "qty": h.qty, "buyDate": h.buyDate} for h in body.holdings]
    return await svc.get_portfolio_history(holdings)
