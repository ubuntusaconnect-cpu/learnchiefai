
-- 1) Provider configs
CREATE TABLE public.ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  model TEXT,
  has_key BOOLEAN NOT NULL DEFAULT false,
  last_test_ok BOOLEAN,
  last_test_error TEXT,
  last_test_at TIMESTAMPTZ,
  last_test_latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_configs TO authenticated;
GRANT ALL ON public.ai_provider_configs TO service_role;
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provider configs"
  ON public.ai_provider_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_ai_provider_configs_updated
  BEFORE UPDATE ON public.ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Provider secrets — service_role only (no authenticated grants → deny all client reads)
CREATE TABLE public.ai_provider_secrets (
  provider_key TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_provider_secrets TO service_role;
ALTER TABLE public.ai_provider_secrets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ai_provider_secrets_updated
  BEFORE UPDATE ON public.ai_provider_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Request logs
CREATE TABLE public.ai_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT,
  operation TEXT,
  status TEXT NOT NULL,
  duration_ms INT,
  tokens_in INT,
  tokens_out INT,
  cached BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_request_logs_created_idx ON public.ai_request_logs (created_at DESC);
CREATE INDEX ai_request_logs_provider_idx ON public.ai_request_logs (provider);
GRANT SELECT ON public.ai_request_logs TO authenticated;
GRANT ALL ON public.ai_request_logs TO service_role;
ALTER TABLE public.ai_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read AI logs"
  ON public.ai_request_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Response cache — service_role only
CREATE TABLE public.ai_cache (
  prompt_hash TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  tokens_in INT,
  tokens_out INT,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMPTZ
);
GRANT ALL ON public.ai_cache TO service_role;
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

-- 5) Seed the supported providers with default priority + model
INSERT INTO public.ai_provider_configs (provider_key, priority, enabled, model) VALUES
  ('lovable',    5,  true, 'google/gemini-3.5-flash'),
  ('gemini',     10, true, 'gemini-2.0-flash'),
  ('groq',       20, true, 'llama-3.3-70b-versatile'),
  ('openrouter', 30, true, 'google/gemini-2.0-flash-exp:free'),
  ('openai',     40, true, 'gpt-4o-mini'),
  ('anthropic',  50, true, 'claude-3-5-haiku-20241022'),
  ('mistral',    60, true, 'mistral-small-latest')
ON CONFLICT (provider_key) DO NOTHING;

-- 6) Mark Lovable as always-configured (uses managed LOVABLE_API_KEY env var, not the secrets table)
UPDATE public.ai_provider_configs SET has_key = true WHERE provider_key = 'lovable';
