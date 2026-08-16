-- Split public catalogue reads from staff reads so the role-check helper no
-- longer needs to be callable by visitors who are not signed in.
DROP POLICY IF EXISTS "lessons read" ON public.lessons;
CREATE POLICY "lessons public read published"
  ON public.lessons FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = lessons.module_id AND c.is_published
  ));
CREATE POLICY "lessons staff read"
  ON public.lessons FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = lessons.module_id
      AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "modules public read" ON public.modules;
CREATE POLICY "modules public read published"
  ON public.modules FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = modules.course_id AND c.is_published
  ));
CREATE POLICY "modules staff read"
  ON public.modules FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = modules.course_id
      AND (c.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;