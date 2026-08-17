-- 1. Account status / activity columns on profiles -----------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid,
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_logout_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_status_chk
    CHECK (account_status IN ('active','inactive','suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ordinary users may edit their own profile, but never these fields.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.account_status := OLD.account_status;
  NEW.status_reason := OLD.status_reason;
  NEW.status_changed_at := OLD.status_changed_at;
  NEW.status_changed_by := OLD.status_changed_by;
  NEW.login_count := OLD.login_count;
  NEW.last_login_at := OLD.last_login_at;
  NEW.last_logout_at := OLD.last_logout_at;
  NEW.last_seen_at := OLD.last_seen_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_protect_admin_fields ON public.profiles;
CREATE TRIGGER profiles_protect_admin_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();

DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;
CREATE POLICY "admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Warnings -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  reason text NOT NULL,
  message text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revocation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_warnings_severity_chk CHECK (severity IN ('low','medium','high'))
);

GRANT SELECT, INSERT, UPDATE ON public.user_warnings TO authenticated;
GRANT ALL ON public.user_warnings TO service_role;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own warnings or admin" ON public.user_warnings;
CREATE POLICY "read own warnings or admin" ON public.user_warnings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins issue warnings" ON public.user_warnings;
CREATE POLICY "admins issue warnings" ON public.user_warnings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND issued_by = auth.uid() AND user_id <> auth.uid());

DROP POLICY IF EXISTS "admins update warnings" ON public.user_warnings;
CREATE POLICY "admins update warnings" ON public.user_warnings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS user_warnings_touch ON public.user_warnings;
CREATE TRIGGER user_warnings_touch BEFORE UPDATE ON public.user_warnings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Users acknowledge, never edit.
CREATE OR REPLACE FUNCTION public.acknowledge_warning(_warning_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.user_warnings
     SET acknowledged_at = coalesce(acknowledged_at, now())
   WHERE id = _warning_id AND user_id = auth.uid();
END $$;

-- 3. Presence / login / activity recording ------------------------------------
CREATE OR REPLACE FUNCTION public.record_login(_session_id uuid, _method text DEFAULT 'password', _platform text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); st text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.learner_sessions (id, user_id, started_at, last_seen_at, platform, user_agent)
  VALUES (_session_id, uid, now(), now(), left(coalesce(_platform,''), 120), left(coalesce(_user_agent,''), 400))
  ON CONFLICT (id) DO UPDATE SET last_seen_at = now();
  UPDATE public.profiles
     SET login_count = login_count + 1, last_login_at = now(), last_seen_at = now()
   WHERE id = uid
   RETURNING account_status INTO st;
  INSERT INTO public.activity_events (user_id, session_id, event_type, occurred_at, metadata)
  VALUES (uid, _session_id, 'login', now(), jsonb_build_object('method', left(coalesce(_method,'password'), 40)));
  RETURN jsonb_build_object('account_status', coalesce(st, 'active'));
END $$;

CREATE OR REPLACE FUNCTION public.touch_presence(_session_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET last_seen_at = now() WHERE id = uid;
  IF _session_id IS NOT NULL THEN
    UPDATE public.learner_sessions SET last_seen_at = now()
     WHERE id = _session_id AND user_id = uid AND ended_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_logout(_session_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET last_logout_at = now(), last_seen_at = NULL WHERE id = uid;
  IF _session_id IS NOT NULL THEN
    UPDATE public.learner_sessions
       SET ended_at = now(), end_reason = 'signout', last_seen_at = now()
     WHERE id = _session_id AND user_id = uid AND ended_at IS NULL;
  END IF;
  INSERT INTO public.activity_events (user_id, session_id, event_type, occurred_at)
  VALUES (uid, _session_id, 'logout', now());
END $$;

CREATE OR REPLACE FUNCTION public.log_activity(_event_type text, _session_id uuid DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.activity_events (user_id, session_id, event_type, occurred_at, metadata)
  VALUES (uid, _session_id, left(_event_type, 60), now(), coalesce(_metadata, '{}'::jsonb));
  UPDATE public.profiles SET last_seen_at = now() WHERE id = uid;
END $$;

-- 4. Admin read models --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_overview()
RETURNS TABLE (
  id uuid, full_name text, email text, role text, account_status text,
  login_count integer, last_login_at timestamptz, last_logout_at timestamptz,
  last_seen_at timestamptz, last_activity_at timestamptz, created_at timestamptz,
  ai_count bigint, ai_last_at timestamptz, ai_errors bigint, ai_today bigint,
  warnings_active bigint, warnings_total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, u.email::text, coalesce(public.get_primary_role(p.id)::text,'student'),
         p.account_status, p.login_count, p.last_login_at, p.last_logout_at, p.last_seen_at,
         GREATEST(coalesce(p.last_seen_at, 'epoch'::timestamptz), coalesce(act.last_at, 'epoch'::timestamptz)),
         p.created_at,
         coalesce(ai.total, 0), ai.last_at, coalesce(ai.errors, 0), coalesce(ai.today, 0),
         coalesce(w.active, 0), coalesce(w.total, 0)
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS total, max(created_at) AS last_at,
             count(*) FILTER (WHERE status <> 'ok') AS errors,
             count(*) FILTER (WHERE created_at > now() - interval '1 day') AS today
        FROM public.ai_request_logs l WHERE l.user_id = p.id
    ) ai ON true
    LEFT JOIN LATERAL (
      SELECT max(occurred_at) AS last_at FROM public.activity_events a WHERE a.user_id = p.id
    ) act ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE resolved_at IS NULL AND revoked_at IS NULL) AS active
        FROM public.user_warnings x WHERE x.user_id = p.id
    ) w ON true
   WHERE public.has_role(auth.uid(), 'admin')
$$;

REVOKE ALL ON FUNCTION public.admin_user_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_users_page(
  _q text DEFAULT NULL, _role text DEFAULT NULL, _status text DEFAULT NULL,
  _presence text DEFAULT NULL, _ai text DEFAULT NULL, _warned boolean DEFAULT NULL,
  _sort text DEFAULT 'last_activity', _dir text DEFAULT 'desc',
  _limit integer DEFAULT 25, _offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 25), 1), 100);
  off integer := greatest(coalesce(_offset, 0), 0);
  total bigint;
  rows jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _admin_page_tmp ON COMMIT DROP AS SELECT 1 WHERE false;

  SELECT count(*) INTO total FROM public.admin_user_overview() b
   WHERE (_q IS NULL OR _q = '' OR b.full_name ILIKE '%'||_q||'%' OR b.email ILIKE '%'||_q||'%')
     AND (_role IS NULL OR b.role = _role)
     AND (_status IS NULL OR b.account_status = _status)
     AND (_presence IS NULL OR (_presence = 'online') = (b.last_seen_at > now() - interval '3 minutes'))
     AND (_ai IS NULL OR (_ai = 'yes') = (b.ai_count > 0))
     AND (_warned IS NULL OR _warned = (b.warnings_active > 0));

  SELECT coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('online', t.last_seen_at > now() - interval '3 minutes')), '[]'::jsonb)
    INTO rows
    FROM (
      SELECT * FROM public.admin_user_overview() b
       WHERE (_q IS NULL OR _q = '' OR b.full_name ILIKE '%'||_q||'%' OR b.email ILIKE '%'||_q||'%')
         AND (_role IS NULL OR b.role = _role)
         AND (_status IS NULL OR b.account_status = _status)
         AND (_presence IS NULL OR (_presence = 'online') = (b.last_seen_at > now() - interval '3 minutes'))
         AND (_ai IS NULL OR (_ai = 'yes') = (b.ai_count > 0))
         AND (_warned IS NULL OR _warned = (b.warnings_active > 0))
       ORDER BY
         CASE WHEN _sort = 'last_login' AND _dir = 'desc' THEN b.last_login_at END DESC NULLS LAST,
         CASE WHEN _sort = 'last_login' AND _dir <> 'desc' THEN b.last_login_at END ASC NULLS LAST,
         CASE WHEN _sort = 'ai' AND _dir = 'desc' THEN b.ai_count END DESC NULLS LAST,
         CASE WHEN _sort = 'ai' AND _dir <> 'desc' THEN b.ai_count END ASC NULLS LAST,
         CASE WHEN _sort = 'warnings' AND _dir = 'desc' THEN b.warnings_active END DESC NULLS LAST,
         CASE WHEN _sort = 'warnings' AND _dir <> 'desc' THEN b.warnings_active END ASC NULLS LAST,
         CASE WHEN _sort = 'created' AND _dir = 'desc' THEN b.created_at END DESC NULLS LAST,
         CASE WHEN _sort = 'created' AND _dir <> 'desc' THEN b.created_at END ASC NULLS LAST,
         CASE WHEN _sort NOT IN ('last_login','ai','warnings','created') AND _dir = 'desc' THEN b.last_activity_at END DESC NULLS LAST,
         CASE WHEN _sort NOT IN ('last_login','ai','warnings','created') AND _dir <> 'desc' THEN b.last_activity_at END ASC NULLS LAST,
         b.created_at DESC
       LIMIT lim OFFSET off
    ) t;

  RETURN jsonb_build_object('total', total, 'rows', rows, 'limit', lim, 'offset', off);
END $$;

REVOKE ALL ON FUNCTION public.admin_users_page(text,text,text,text,text,boolean,text,text,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_users_page(text,text,text,text,text,boolean,text,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'user', (SELECT to_jsonb(b) || jsonb_build_object('online', b.last_seen_at > now() - interval '3 minutes')
               FROM public.admin_user_overview() b WHERE b.id = _user_id),
    'activity', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at DESC), '[]'::jsonb)
                   FROM (SELECT event_type, occurred_at, subject, topic, metadata
                           FROM public.activity_events WHERE user_id = _user_id
                          ORDER BY occurred_at DESC LIMIT 25) a),
    'sessions', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.started_at DESC), '[]'::jsonb)
                   FROM (SELECT id, started_at, ended_at, end_reason, last_seen_at, platform
                           FROM public.learner_sessions WHERE user_id = _user_id
                          ORDER BY started_at DESC LIMIT 10) s),
    'warnings', (SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.issued_at DESC), '[]'::jsonb)
                   FROM (SELECT x.id, x.category, x.severity, x.reason, x.message, x.issued_at, x.expires_at,
                                x.acknowledged_at, x.resolved_at, x.resolution_note, x.revoked_at, x.revocation_note,
                                x.issued_by, ip.full_name AS issued_by_name
                           FROM public.user_warnings x
                           LEFT JOIN public.profiles ip ON ip.id = x.issued_by
                          WHERE x.user_id = _user_id ORDER BY x.issued_at DESC) w),
    'ai', (SELECT jsonb_build_object(
              'week', count(*) FILTER (WHERE created_at > now() - interval '7 days'),
              'today', count(*) FILTER (WHERE created_at > now() - interval '1 day'),
              'errors', count(*) FILTER (WHERE status <> 'ok'),
              'total', count(*))
             FROM public.ai_request_logs WHERE user_id = _user_id)
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_user_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'online_now', (SELECT count(*) FROM public.profiles WHERE last_seen_at > now() - interval '3 minutes'),
    'active_accounts', (SELECT count(*) FROM public.profiles WHERE account_status = 'active'),
    'inactive_accounts', (SELECT count(*) FROM public.profiles WHERE account_status = 'inactive'),
    'suspended_accounts', (SELECT count(*) FROM public.profiles WHERE account_status = 'suspended'),
    'ai_users_today', (SELECT count(DISTINCT user_id) FROM public.ai_request_logs WHERE created_at > date_trunc('day', now())),
    'ai_calls_today', (SELECT count(*) FROM public.ai_request_logs WHERE created_at > date_trunc('day', now())),
    'active_warnings', (SELECT count(*) FROM public.user_warnings WHERE resolved_at IS NULL AND revoked_at IS NULL),
    'logins_today', (SELECT count(*) FROM public.activity_events WHERE event_type = 'login' AND occurred_at > date_trunc('day', now()))
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_dashboard_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary() TO authenticated;

-- 5. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles (account_status);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_created ON public.ai_request_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_occurred ON public.activity_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON public.user_warnings (user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_warnings_open ON public.user_warnings (user_id) WHERE resolved_at IS NULL AND revoked_at IS NULL;