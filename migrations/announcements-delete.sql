-- El que mando un aviso lo puede borrar (desaparece para todos los
-- destinatarios); el admin puede borrar cualquiera.
create policy announcements_delete on public.announcements for delete using (
  auth.uid() = sender_id or is_staff()
);

notify pgrst, 'reload schema';
