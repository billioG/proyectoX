alter table public.lessons alter column content_url drop not null;
notify pgrst, 'reload schema';
