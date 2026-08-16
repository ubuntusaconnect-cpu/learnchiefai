-- Video files follow the publication state of their content record.
DROP POLICY IF EXISTS "Signed-in users read learning videos" ON storage.objects;
CREATE POLICY "Signed-in users read published learning videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'learning-videos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.learning_content lc
        WHERE lc.file_path = storage.objects.name AND lc.status = 'published'
      )
    )
  );