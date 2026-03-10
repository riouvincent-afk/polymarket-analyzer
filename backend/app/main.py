from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import markets

app = FastAPI(title="Polymarket Analyzer API", version="0.1.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router, prefix="/api/markets", tags=["markets"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
