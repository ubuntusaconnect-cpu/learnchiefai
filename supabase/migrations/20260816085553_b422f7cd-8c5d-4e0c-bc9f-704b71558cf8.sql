-- The public lesson visibility rule calls has_role(), so visitors who are not
-- signed in must be able to execute it for published lessons to load.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;