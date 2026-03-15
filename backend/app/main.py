from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.routers import markets, stocks
from app.routers.auth import router as auth_router

app = FastAPI(title="Polymarket Analyzer API", version="0.1.0")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router, prefix="/api/markets", tags=["markets"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
