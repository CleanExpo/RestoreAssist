-- Revoke anon EXECUTE on SECURITY DEFINER workspace functions (idempotent)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.is_workspace_member(text) FROM anon;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(text) FROM anon;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
