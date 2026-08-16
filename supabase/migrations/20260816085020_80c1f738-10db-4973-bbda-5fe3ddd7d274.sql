-- ========== 1. Least-privilege table grants ==========
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Only genuinely public catalogue data stays readable without a session.
GRANT SELECT ON public.announcements TO anon;
GRANT SELECT ON public.subjects TO anon;
GRANT SELECT ON public.courses TO anon;
GRANT SELECT ON public.modules TO anon;
GRANT SELECT ON public.lessons TO anon;
GRANT SELECT ON public.curriculum_nodes TO anon;

-- Tables that only backend code may touch: no direct API access at all.
REVOKE ALL ON public.ai_provider_secrets FROM authenticated;
REVOKE ALL ON public.ai_cache FROM authenticated;
REVOKE ALL ON public.ai_request_logs FROM authenticated;
REVOKE ALL ON public.content_versions FROM authenticated;

-- Audit trails are append-only from the backend and read-only for admins.
REVOKE ALL ON public.admin_audit_log FROM authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;

-- ========== 2. Profiles: no cross-user browsing ==========
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles read own or admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- ========== 3. Quiz answer keys are never exposed over the API ==========
DROP POLICY IF EXISTS "questions read auth" ON public.quiz_questions;
CREATE POLICY "questions read auth"
  ON public.quiz_questions FOR SELECT TO authenticated
  USING (true);
REVOKE ALL ON public.quiz_questions FROM authenticated;
GRANT SELECT (id, quiz_id, question, options, position) ON public.quiz_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;

-- Answer checking happens in the database, so the key never leaves the server.
CREATE OR REPLACE FUNCTION public.check_quiz_answer(_question_id uuid, _answer text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE q record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT correct_answer, explanation INTO q FROM public.quiz_questions WHERE id = _question_id;
  IF q IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'correct', lower(btrim(coalesce(_answer, ''))) = lower(btrim(coalesce(q.correct_answer, ''))),
    'explanation', q.explanation
  );
END $$;
REVOKE ALL ON FUNCTION public.check_quiz_answer(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_quiz_answer(uuid, text) TO authenticated, service_role;

-- ========== 4. Unused privileged helper is no longer callable from the API ==========
REVOKE ALL ON FUNCTION public.get_primary_role(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_primary_role(uuid) TO service_role;

-- ========== 5. Server-side rate limiting ==========
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup
  ON public.rate_limit_events (bucket, subject, created_at DESC);
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;
GRANT ALL ON public.rate_limit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _bucket text, _subject text, _limit integer, _window_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE used integer;
BEGIN
  IF _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;
  DELETE FROM public.rate_limit_events WHERE created_at < now() - interval '2 days';
  SELECT count(*) INTO used FROM public.rate_limit_events
   WHERE bucket = _bucket AND subject = _subject
     AND created_at > now() - make_interval(secs => _window_seconds);
  IF used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', used, 'retry_after', _window_seconds);
  END IF;
  INSERT INTO public.rate_limit_events (bucket, subject) VALUES (_bucket, _subject);
  RETURN jsonb_build_object('allowed', true, 'used', used + 1);
END $$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) TO service_role;

-- ========== 6. Security event trail ==========
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_recent ON public.security_events (created_at DESC);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_events FROM anon, authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
DROP POLICY IF EXISTS "Admins read security events" ON public.security_events;
CREATE POLICY "Admins read security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ========== 7. Staging uploads are admin-only ==========
DROP POLICY IF EXISTS "Authenticated read content library" ON storage.objects;
CREATE POLICY "Admins read content library"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content-library' AND public.has_role(auth.uid(), 'admin'));