
-- ROLES
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  school TEXT,
  grade TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_primary_role(_user_id UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'teacher' THEN 2 ELSE 3 END LIMIT 1 $$;

-- Auto-create profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested_role app_role := 'student';
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  IF NEW.raw_user_meta_data->>'role' = 'teacher' THEN requested_role := 'teacher'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested_role);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SUBJECTS
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'academic',
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects public read" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "subjects admin manage" ON public.subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- COURSES
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_url TEXT,
  level TEXT DEFAULT 'beginner',
  grade TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT ON public.courses TO anon;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses public read published" ON public.courses FOR SELECT USING (is_published = true);
CREATE POLICY "courses owner read" ON public.courses FOR SELECT TO authenticated USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses teacher insert" ON public.courses FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin')) AND auth.uid() = teacher_id);
CREATE POLICY "courses owner update" ON public.courses FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "courses owner delete" ON public.courses FOR DELETE TO authenticated
  USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));

-- MODULES
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules TO authenticated;
GRANT SELECT ON public.modules TO anon;
GRANT ALL ON public.modules TO service_role;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules public read" ON public.modules FOR SELECT USING (
  EXISTS(SELECT 1 FROM public.courses c WHERE c.id = course_id AND (c.is_published OR c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "modules teacher manage" ON public.modules FOR ALL TO authenticated USING (
  EXISTS(SELECT 1 FROM public.courses c WHERE c.id = course_id AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.courses c WHERE c.id = course_id AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

-- LESSONS
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT,
  notes_url TEXT,
  duration_minutes INT DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT SELECT ON public.lessons TO anon;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons read" ON public.lessons FOR SELECT USING (
  EXISTS(SELECT 1 FROM public.modules m JOIN public.courses c ON c.id = m.course_id
         WHERE m.id = module_id AND (c.is_published OR c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "lessons teacher manage" ON public.lessons FOR ALL TO authenticated USING (
  EXISTS(SELECT 1 FROM public.modules m JOIN public.courses c ON c.id = m.course_id
         WHERE m.id = module_id AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.modules m JOIN public.courses c ON c.id = m.course_id
         WHERE m.id = module_id AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

-- QUIZZES
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes read auth" ON public.quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "quizzes teacher manage" ON public.quizzes FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin')
) WITH CHECK (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions read auth" ON public.quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "questions teacher manage" ON public.quiz_questions FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin')
) WITH CHECK (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin'));

-- ENROLLMENTS & PROGRESS
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enroll own read" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "enroll insert own" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "enroll delete own" ON public.enrollments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;
GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress own" ON public.lesson_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts own" ON public.quiz_attempts FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher')) WITH CHECK (auth.uid() = user_id);

-- BOOKMARKS
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks own" ON public.bookmarks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI CONVERSATIONS
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai convo own" ON public.ai_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai messages own" ON public.ai_messages FOR ALL TO authenticated USING (
  EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

-- ANNOUNCEMENTS
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann public read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "ann admin manage" ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SEED SUBJECTS
INSERT INTO public.subjects (name, slug, description, category, icon) VALUES
  ('Mathematics', 'mathematics', 'Algebra, geometry, trigonometry, calculus and problem solving.', 'academic', 'Sigma'),
  ('Physical Sciences', 'physical-sciences', 'Physics and chemistry for grades 10–12.', 'academic', 'FlaskConical'),
  ('Life Sciences', 'life-sciences', 'Biology, ecology and human physiology.', 'academic', 'Leaf'),
  ('English', 'english', 'Language, comprehension and literature.', 'academic', 'BookOpen'),
  ('Python Programming', 'python-programming', 'Learn to code with Python from beginner to advanced.', 'technology', 'Code'),
  ('Web Development', 'web-development', 'HTML, CSS, JavaScript and modern web frameworks.', 'technology', 'Globe'),
  ('Robotics', 'robotics', 'Build, wire and program robots.', 'engineering', 'Bot'),
  ('Electronics & Engineering Graphics', 'engineering', 'Circuits, EGD and engineering fundamentals.', 'engineering', 'Cpu'),
  ('Design Thinking', 'design', 'Creative problem solving and UX fundamentals.', 'design', 'Palette'),
  ('Entrepreneurship', 'business', 'Business, finance and starting a venture.', 'business', 'Briefcase');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ai_convo_updated BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
