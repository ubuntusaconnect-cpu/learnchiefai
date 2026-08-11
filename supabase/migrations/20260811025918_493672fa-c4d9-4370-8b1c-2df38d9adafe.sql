CREATE POLICY "Admins write content library" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'content-library' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update content library" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'content-library' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete content library" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'content-library' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read content library" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'content-library');