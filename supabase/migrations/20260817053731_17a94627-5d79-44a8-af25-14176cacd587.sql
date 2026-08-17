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
REVOKE ALL ON FUNCTION public.record_login(uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_login(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.touch_presence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_logout(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_logout(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.log_activity(text,uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.acknowledge_warning(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_warning(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_admin_fields() FROM anon, authenticated;