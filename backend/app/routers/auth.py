from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = 7

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def _sb():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(503, "Supabase non configuré — ajoutez SUPABASE_URL et SUPABASE_SERVICE_KEY dans backend/.env")
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _create_token(user_id: str, email: str, plan: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "email": email, "plan": plan, "exp": expire},
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )


def _verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Token invalide ou expiré")


def _get_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        if token:
            return token
    raise HTTPException(401, "Non authentifié")


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class ProfileUpdateBody(BaseModel):
    profil_investisseur: str | None = None
    wallet_address: str | None = None

class PreferencesBody(BaseModel):
    alertes_email: bool | None = None
    notifications_push: bool | None = None
    objectifs: str | None = None
    objectif_rendement: float | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(body: RegisterBody):
    if len(body.password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
    sb = _sb()
    existing = sb.table("users").select("id").eq("email", body.email.lower()).execute()
    if existing.data:
        raise HTTPException(400, "Cet email est déjà utilisé")
    password_hash = pwd_context.hash(body.password)
    result = sb.table("users").insert({
        "email": body.email.lower(),
        "password_hash": password_hash,
        "plan": "free",
        "profil_investisseur": "modere",
    }).execute()
    user = result.data[0]
    # Create default preferences
    sb.table("user_preferences").insert({"user_id": user["id"]}).execute()
    token = _create_token(user["id"], user["email"], user["plan"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "plan": user["plan"], "profil_investisseur": user["profil_investisseur"]}}


@router.post("/login")
async def login(body: LoginBody):
    sb = _sb()
    result = sb.table("users").select("*").eq("email", body.email.lower()).execute()
    if not result.data:
        raise HTTPException(401, "Email ou mot de passe incorrect")
    user = result.data[0]
    if not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = _create_token(user["id"], user["email"], user["plan"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "plan": user["plan"], "profil_investisseur": user.get("profil_investisseur", "modere")}}


@router.post("/logout")
async def logout():
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    token = _get_token(request)
    payload = _verify_token(token)
    user_id = payload["sub"]
    sb = _sb()
    result = sb.table("users").select("id, email, plan, profil_investisseur, wallet_address, created_at").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "Utilisateur introuvable")
    user = result.data[0]
    prefs = sb.table("user_preferences").select("*").eq("user_id", user_id).execute()
    user["preferences"] = prefs.data[0] if prefs.data else {}
    return user


@router.put("/profile")
async def update_profile(body: ProfileUpdateBody, request: Request):
    token = _get_token(request)
    payload = _verify_token(token)
    user_id = payload["sub"]
    sb = _sb()
    updates: dict = {}
    if body.profil_investisseur is not None:
        if body.profil_investisseur not in ("conservateur", "modere", "agressif"):
            raise HTTPException(400, "Profil invalide")
        updates["profil_investisseur"] = body.profil_investisseur
    if body.wallet_address is not None:
        updates["wallet_address"] = body.wallet_address
    if updates:
        sb.table("users").update(updates).eq("id", user_id).execute()
    result = sb.table("users").select("id, email, plan, profil_investisseur, wallet_address").eq("id", user_id).execute()
    return result.data[0]


@router.put("/preferences")
async def update_preferences(body: PreferencesBody, request: Request):
    token = _get_token(request)
    payload = _verify_token(token)
    user_id = payload["sub"]
    sb = _sb()
    updates: dict = {}
    if body.alertes_email is not None:
        updates["alertes_email"] = body.alertes_email
    if body.notifications_push is not None:
        updates["notifications_push"] = body.notifications_push
    if body.objectifs is not None:
        updates["objectifs"] = body.objectifs
    if body.objectif_rendement is not None:
        updates["objectif_rendement"] = body.objectif_rendement
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        sb.table("user_preferences").update(updates).eq("user_id", user_id).execute()
    result = sb.table("user_preferences").select("*").eq("user_id", user_id).execute()
    return result.data[0] if result.data else {}
