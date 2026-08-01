revoke all on function public.submit_public_registration(
  text, text, date, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) from public, anon, authenticated;

grant execute on function public.submit_public_registration(
  text, text, date, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) to service_role;

notify pgrst, 'reload schema';