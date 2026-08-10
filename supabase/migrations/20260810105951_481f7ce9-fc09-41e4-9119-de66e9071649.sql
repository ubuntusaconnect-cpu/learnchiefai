-- ============ CURRICULUM TREE ============
CREATE TABLE public.curriculum_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grade','subject','section','topic','subtopic')),
  name text NOT NULL,
  grade smallint,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX curriculum_nodes_parent_idx ON public.curriculum_nodes(parent_id);
CREATE INDEX curriculum_nodes_kind_idx ON public.curriculum_nodes(kind);
CREATE UNIQUE INDEX curriculum_nodes_uniq ON public.curriculum_nodes(kind, lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.curriculum_nodes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_nodes TO authenticated;
GRANT ALL ON public.curriculum_nodes TO service_role;
ALTER TABLE public.curriculum_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Curriculum is readable by everyone" ON public.curriculum_nodes FOR SELECT USING (true);
CREATE POLICY "Admins manage curriculum" ON public.curriculum_nodes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER curriculum_nodes_touch BEFORE UPDATE ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ LEARNING CONTENT (videos today, more later) ============
CREATE TABLE public.learning_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL DEFAULT 'video'
    CHECK (content_type IN ('video','pdf','notes','textbook','interactive','quiz','test','past_paper','audio','flashcards')),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','processing','ai_analyzing','awaiting_review','published','failed')),
  title text NOT NULL DEFAULT '',
  description text,
  grade smallint,
  subject text,
  section text,
  topic text,
  subtopic text,
  curriculum_node_id uuid REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  search_tags text[] NOT NULL DEFAULT '{}',
  objectives text[] NOT NULL DEFAULT '{}',
  transcript text,
  duration_seconds integer,
  file_path text,
  file_size bigint,
  mime_type text,
  thumbnail_path text,
  thumbnail_suggestion text,
  ai_analysis jsonb,
  confidence jsonb,
  needs_confirmation boolean NOT NULL DEFAULT false,
  error_message text,
  original_filename text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_content_status_idx ON public.learning_content(status);
CREATE INDEX learning_content_browse_idx ON public.learning_content(grade, subject, section, topic);
CREATE INDEX learning_content_type_idx ON public.learning_content(content_type);

ALTER TABLE public.learning_content ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION public.learning_content_search_refresh()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.subject,'') || ' ' || coalesce(NEW.section,'') || ' ' || coalesce(NEW.topic,'') || ' ' || coalesce(NEW.subtopic,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.keywords, ' '),'') || ' ' || coalesce(array_to_string(NEW.search_tags, ' '),'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description,'')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.transcript,'')), 'D');
  RETURN NEW;
END
$fn$;

CREATE TRIGGER learning_content_search_trg BEFORE INSERT OR UPDATE ON public.learning_content
  FOR EACH ROW EXECUTE FUNCTION public.learning_content_search_refresh();
CREATE INDEX learning_content_search_idx ON public.learning_content USING GIN(search_vector);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_content TO authenticated;
GRANT ALL ON public.learning_content TO service_role;
ALTER TABLE public.learning_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read published content" ON public.learning_content FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert content" ON public.learning_content FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update content" ON public.learning_content FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete content" ON public.learning_content FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER learning_content_touch BEFORE UPDATE ON public.learning_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PROGRESS (online + offline sync) ============
CREATE TABLE public.content_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.learning_content(id) ON DELETE CASCADE,
  position_seconds numeric NOT NULL DEFAULT 0,
  duration_seconds numeric,
  completed boolean NOT NULL DEFAULT false,
  watched_offline boolean NOT NULL DEFAULT false,
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_progress TO authenticated;
GRANT ALL ON public.content_progress TO service_role;
ALTER TABLE public.content_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own progress" ON public.content_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER content_progress_touch BEFORE UPDATE ON public.content_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SEARCH FUNCTION ============
CREATE OR REPLACE FUNCTION public.search_learning_content(_q text, _grade smallint DEFAULT NULL, _content_type text DEFAULT NULL)
RETURNS SETOF public.learning_content
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.learning_content
  WHERE status = 'published'
    AND (_grade IS NULL OR grade = _grade)
    AND (_content_type IS NULL OR content_type = _content_type)
    AND (
      _q IS NULL OR _q = '' OR
      search_vector @@ websearch_to_tsquery('english', _q) OR
      title ILIKE '%' || _q || '%' OR
      topic ILIKE '%' || _q || '%' OR
      subtopic ILIKE '%' || _q || '%' OR
      EXISTS (SELECT 1 FROM unnest(keywords) k WHERE k ILIKE '%' || _q || '%')
    )
  ORDER BY
    CASE WHEN _q IS NULL OR _q = '' THEN 0
         ELSE ts_rank(search_vector, websearch_to_tsquery('english', _q)) END DESC,
    published_at DESC NULLS LAST
  LIMIT 200
$$;

-- ============ VIDEO STORAGE POLICIES ============
-- bucket 'learning-videos' is created separately (private)
CREATE POLICY "Signed-in users read learning videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'learning-videos');
CREATE POLICY "Admins write learning videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'learning-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update learning videos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'learning-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete learning videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'learning-videos' AND public.has_role(auth.uid(), 'admin'));

-- ============ SEED CURRICULUM (Grades 9-12) ============
DO $$
DECLARE g smallint; gid uuid; sid uuid; secid uuid; topid uuid;
  subj text; sec text; top text; sub text;
  subjects text[] := ARRAY['Mathematics','Mathematical Literacy','Physical Sciences','Life Sciences','English','Geography','History','Accounting','Business Studies','Economics','Computer Applications Technology','Information Technology'];
BEGIN
  FOREACH g IN ARRAY ARRAY[9,10,11,12]::smallint[] LOOP
    INSERT INTO public.curriculum_nodes (kind, name, grade) VALUES ('grade', 'Grade ' || g, g) RETURNING id INTO gid;
    FOREACH subj IN ARRAY subjects LOOP
      INSERT INTO public.curriculum_nodes (parent_id, kind, name, grade) VALUES (gid, 'subject', subj, g) RETURNING id INTO sid;
      FOREACH sec IN ARRAY (
        CASE subj
          WHEN 'Physical Sciences' THEN ARRAY['Physics','Chemistry']
          WHEN 'Mathematics' THEN ARRAY['Algebra','Geometry','Trigonometry','Functions','Calculus','Probability and Statistics']
          WHEN 'Life Sciences' THEN ARRAY['Cells and Tissues','Human Physiology','Plant Biology','Genetics and Inheritance','Evolution','Environmental Studies']
          WHEN 'English' THEN ARRAY['Language Structures','Literature','Comprehension','Writing and Presenting']
          WHEN 'Geography' THEN ARRAY['Climatology','Geomorphology','Settlement Geography','Economic Geography','Mapwork']
          WHEN 'History' THEN ARRAY['Sources and Skills','World History','South African History']
          WHEN 'Accounting' THEN ARRAY['Financial Accounting','Managerial Accounting','Managing Resources']
          WHEN 'Business Studies' THEN ARRAY['Business Environments','Business Ventures','Business Roles','Business Operations']
          WHEN 'Economics' THEN ARRAY['Macroeconomics','Microeconomics','Economic Pursuits','Contemporary Economic Issues']
          WHEN 'Information Technology' THEN ARRAY['Programming and Software Development','Data and Information Management','Solution Development','Communication Technologies']
          WHEN 'Computer Applications Technology' THEN ARRAY['Systems Technologies','Word Processing','Spreadsheets','Databases','Solution Development','Information Management']
          WHEN 'Mathematical Literacy' THEN ARRAY['Numbers and Calculations','Patterns and Relationships','Measurement','Maps and Plans','Data Handling','Finance']
          ELSE ARRAY['General']
        END
      ) LOOP
        INSERT INTO public.curriculum_nodes (parent_id, kind, name, grade) VALUES (sid, 'section', sec, g) RETURNING id INTO secid;
        FOREACH top IN ARRAY (
          CASE sec
            WHEN 'Physics' THEN ARRAY['Mechanics','Waves, Sound and Light','Electricity and Magnetism','Matter and Materials']
            WHEN 'Chemistry' THEN ARRAY['Chemical Change','Chemical Systems','Matter and Materials','Organic Chemistry']
            WHEN 'Algebra' THEN ARRAY['Exponents and Surds','Equations and Inequalities','Number Patterns','Sequences and Series']
            WHEN 'Geometry' THEN ARRAY['Euclidean Geometry','Analytical Geometry','Measurement']
            WHEN 'Trigonometry' THEN ARRAY['Trigonometric Ratios','Trigonometric Identities','Trigonometric Graphs','Solving Triangles']
            WHEN 'Functions' THEN ARRAY['Linear Functions','Quadratic Functions','Exponential Functions','Hyperbolic Functions','Inverse Functions']
            WHEN 'Calculus' THEN ARRAY['Limits','Differentiation','Applications of Calculus']
            WHEN 'Probability and Statistics' THEN ARRAY['Data Handling','Probability Rules','Counting Principles']
            ELSE ARRAY['General']
          END
        ) LOOP
          INSERT INTO public.curriculum_nodes (parent_id, kind, name, grade) VALUES (secid, 'topic', top, g) RETURNING id INTO topid;
          IF top = 'Mechanics' THEN
            FOREACH sub IN ARRAY ARRAY['Newton''s First Law','Newton''s Second Law','Newton''s Third Law','Newton''s Law of Universal Gravitation','Momentum and Impulse','Work, Energy and Power','Vertical Projectile Motion','Forces and Free-Body Diagrams'] LOOP
              INSERT INTO public.curriculum_nodes (parent_id, kind, name, grade) VALUES (topid, 'subtopic', sub, g);
            END LOOP;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;