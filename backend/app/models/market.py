import json
from pydantic import BaseModel, field_validator
from typing import Optional


class MarketTag(BaseModel):
    id: int
    label: str


class Market(BaseModel):
    id: str
    question: str
    slug: Optional[str] = None
    category: Optional[str] = None
    outcomes: list[str] = []
    outcomePrices: list[str] = []
    volume: Optional[str] = None
    volume24hr: Optional[float] = None
    liquidity: Optional[str] = None
    active: bool = False
    closed: bool = False
    endDate: Optional[str] = None
    startDate: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    tags: list[MarketTag] = []

    @field_validator("outcomes", "outcomePrices", mode="before")
    @classmethod
    def parse_json_string(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return []
        return v

    @property
    def yes_price(self) -> float:
        try:
            return float(self.outcomePrices[0])
        except (IndexError, ValueError):
            return 0.0

    @property
    def no_price(self) -> float:
        try:
            return float(self.outcomePrices[1])
        except (IndexError, ValueError):
            return 0.0

    @property
    def volume_float(self) -> float:
        try:
            return float(self.volume or 0)
        except ValueError:
            return 0.0

    @property
    def liquidity_float(self) -> float:
        try:
            return float(self.liquidity or 0)
        except ValueError:
            return 0.0


class MarketResponse(BaseModel):
    id: str
    question: str
    slug: Optional[str] = None
    category: Optional[str] = None
    yes_price: float
    no_price: float
    volume: float
    volume24h: float
    liquidity: float
    active: bool
    closed: bool
    end_date: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = []

    @classmethod
    def from_market(cls, m: Market) -> "MarketResponse":
        return cls(
            id=m.id,
            question=m.question,
            slug=m.slug,
            category=m.category,
            yes_price=m.yes_price,
            no_price=m.no_price,
            volume=m.volume_float,
            volume24h=m.volume24hr or 0.0,
            liquidity=m.liquidity_float,
            active=m.active,
            closed=m.closed,
            end_date=m.endDate,
            image=m.image,
            description=m.description,
            tags=[t.label for t in m.tags],
        )


class MarketsListResponse(BaseModel):
    markets: list[MarketResponse]
    total: int
    limit: int
    offset: int
