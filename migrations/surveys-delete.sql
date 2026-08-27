-- Admin puede eliminar encuestas (y sus respuestas) igual que ya podía con avisos.
drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys for delete using (public.is_admin());

drop policy if exists survey_questions_delete on public.survey_questions;
create policy survey_questions_delete on public.survey_questions for delete using (public.is_admin());

drop policy if exists survey_responses_delete on public.survey_responses;
create policy survey_responses_delete on public.survey_responses for delete using (public.is_admin());

drop policy if exists survey_answers_delete on public.survey_answers;
create policy survey_answers_delete on public.survey_answers for delete using (public.is_admin());

notify pgrst, 'reload schema';
