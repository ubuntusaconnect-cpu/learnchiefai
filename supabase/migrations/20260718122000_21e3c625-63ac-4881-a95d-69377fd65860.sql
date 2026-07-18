
CREATE TABLE public.question_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  grade smallint NOT NULL CHECK (grade BETWEEN 8 AND 12),
  subject text NOT NULL,
  term smallint NOT NULL CHECK (term BETWEEN 1 AND 4),
  year smallint NOT NULL,
  description text,
  paper_url text,
  paper_path text,
  memo_url text,
  memo_path text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_papers TO authenticated;
GRANT ALL ON public.question_papers TO service_role;

ALTER TABLE public.question_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view papers"
  ON public.question_papers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert papers"
  ON public.question_papers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update papers"
  ON public.question_papers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete papers"
  ON public.question_papers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER question_papers_touch
  BEFORE UPDATE ON public.question_papers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_question_papers_grade ON public.question_papers(grade);
CREATE INDEX idx_question_papers_subject ON public.question_papers(subject);
CREATE INDEX idx_question_papers_year ON public.question_papers(year);
CREATE INDEX idx_question_papers_term ON public.question_papers(term);

-- Storage policies for the private 'question-papers' bucket
CREATE POLICY "Authenticated can read question papers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'question-papers');

CREATE POLICY "Admins can upload question papers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'question-papers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update question papers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'question-papers' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'question-papers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete question papers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'question-papers' AND public.has_role(auth.uid(), 'admin'));
