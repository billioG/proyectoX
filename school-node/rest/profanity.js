// Filtro de malas palabras de comentarios y notas: el MISMO que public.contains_profanity de la nube
// (migrations/resource-notes-comments.sql). `\y` de Postgres es un límite de palabra que también entiende letras con tilde;
// aquí se arma con lookarounds de Unicode. La nube lo vuelve a aplicar al sincronizar (supabase/functions/node-sync/social.ts).
const WORDS = 'mierda|pendej[oa]|idiota|est[uú]pid[oa]|imb[eé]cil|put[oa]|maric[oó]n|cabr[oó]n|verga|culer[oa]|gilipollas|joder|hijueputa|hijo de puta|malparid[oa]|carajo|zorra|perra|weon|hue[oó]n';
const PROFANITY = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${WORDS})(?![\\p{L}\\p{N}_])`, 'iu');

export const containsProfanity = (text) => typeof text === 'string' && PROFANITY.test(text);
