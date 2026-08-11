-- ============ CONTENT INGESTION ============
CREATE TABLE public.content_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  mime_type text,
  file_size bigint,
  bucket text,
  file_path text,
  sha256 text,
  text_hash text,
  extracted_text text,
  stage text NOT NULL DEFAULT 'queued',
  status text NOT NULL DEFAULT 'pending',
  progress smallint NOT NULL DEFAULT 0,
  error_message text,
  ai_classification jsonb,
  confidence jsonb,
  overall_confidence numeric,
  destination jsonb,
  content_type text,
  duplicate_of_content_id uuid REFERENCES public.learning_content(id) ON DELETE SET NULL,
  duplicate_of_paper_id uuid REFERENCES public.question_papers(id) ON DELETE SET NULL,
  duplicate_kind text,
  duplicate_score numeric,
  duplicate_decision text,
  needs_review boolean NOT NULL DEFAULT false,
  published_content_id uuid REFERENCES public.learning_content(id) ON DELETE SET NULL,
  published_paper_id uuid REFERENCES public.question_papers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_uploads_sha_idx ON public.content_uploads(sha256);
CREATE INDEX content_uploads_status_idx ON public.content_uploads(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_uploads TO authenticated;
GRANT ALL ON public.content_uploads TO service_role;
ALTER TABLE public.content_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage content uploads" ON public.content_uploads
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER content_uploads_touch BEFORE UPDATE ON public.content_uploads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.learning_content(id) ON DELETE CASCADE,
  paper_id uuid REFERENCES public.question_papers(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_path text,
  bucket text,
  sha256 text,
  snapshot jsonb,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_versions_content_idx ON public.content_versions(content_id, version DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_versions TO authenticated;
GRANT ALL ON public.content_versions TO service_role;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage content versions" ON public.content_versions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.learning_content
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS text_hash text,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS paper_number smallint,
  ADD COLUMN IF NOT EXISTS exam_type text,
  ADD COLUMN IF NOT EXISTS year smallint,
  ADD COLUMN IF NOT EXISTS term smallint,
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS learning_content_sha_idx ON public.learning_content(sha256);
CREATE INDEX IF NOT EXISTS learning_content_texthash_idx ON public.learning_content(text_hash);

ALTER TABLE public.question_papers
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS memo_sha256 text,
  ADD COLUMN IF NOT EXISTS paper_number smallint,
  ADD COLUMN IF NOT EXISTS exam_type text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS question_papers_sha_idx ON public.question_papers(sha256);

-- ============ SESSIONS / ACTIVITY / AUDIT ============
CREATE TABLE public.learner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  device text,
  platform text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learner_sessions_user_idx ON public.learner_sessions(user_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.learner_sessions TO authenticated;
GRANT ALL ON public.learner_sessions TO service_role;
ALTER TABLE public.learner_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON public.learner_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.learner_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own sessions" ON public.learner_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER learner_sessions_touch BEFORE UPDATE ON public.learner_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.learner_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  offline boolean NOT NULL DEFAULT false,
  subject text,
  grade smallint,
  topic text,
  content_id uuid,
  lesson_id uuid,
  duration_seconds integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_user_idx ON public.activity_events(user_id, occurred_at DESC);
CREATE INDEX activity_events_type_idx ON public.activity_events(event_type, occurred_at DESC);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own activity" ON public.activity_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own activity, admins read all" ON public.activity_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  subject_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  record_type text,
  record_id text,
  success boolean NOT NULL DEFAULT true,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS grade smallint,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS offline boolean NOT NULL DEFAULT false;
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS status text;

CREATE POLICY "Admins read all ai conversations" ON public.ai_conversations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read all ai messages" ON public.ai_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER app_settings_touch BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.app_settings (key, value) VALUES ('ai_history_retention_days', '365'::jsonb)
  ON CONFLICT (key) DO NOTHING;