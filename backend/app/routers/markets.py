from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_markets():
    return {"markets": []}


@router.get("/{market_id}")
def get_market(market_id: str):
    return {"market_id": market_id}
