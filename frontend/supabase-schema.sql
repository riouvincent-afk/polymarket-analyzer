-- Run this in your Supabase SQL editor

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  profil_investisseur TEXT DEFAULT 'modere' CHECK (profil_investisseur IN ('conservateur', 'modere', 'agressif')),
  wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  alertes_email BOOLEAN DEFAULT true,
  notifications_push BOOLEAN DEFAULT false,
  objectifs TEXT DEFAULT '',
  objectif_rendement NUMERIC DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  entry_price NUMERIC,
  exit_price NUMERIC,
  quantity NUMERIC,
  pnl NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for service role access (backend uses service key)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

-- Allow service role to bypass RLS (default behavior)
