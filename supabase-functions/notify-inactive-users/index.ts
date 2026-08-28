// Edge Function: notify-inactive-users
// Llamada por pg_cron una vez al día (mismo patrón que trigger-random-event
// -- secreto compartido, no JWT de usuario). Recorre estudiantes y docentes
// (no admin/coordinador) y manda un correo tipo Duolingo cuando:
//   - pasó 1 día desde su último login ("te extrañamos")
//   - pasó 3+ días desde su último login ("hace X días que no entrás")
// email_notifications_log evita reenviar el mismo tipo dos veces dentro de
// la misma racha de ausencia: solo cuenta como "ya enviado" si el registro
// de log es MÁS RECIENTE que el last_login actual del usuario -- en cuanto
// vuelve a entrar, ese log queda "viejo" y puede volver a recibir avisos
// en su próxima ausencia.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;
const FROM_EMAIL = Deno.env.get('REENGAGEMENT_FROM_EMAIL') || 'Quetzal LMS <notificaciones@yoaprendo.online>';
const APP_URL = 'https://clases.yoaprendo.online';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function daysSince(dateStr: string): number {
  const last = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return Math.floor((Date.now() - last.getTime()) / 86400000);
}

function emailHtml(name: string, kind: '24h' | '3d'): { subject: string; html: string } {
  const firstName = (name || '').trim().split(' ')[0] || 'Campeón/a';
  if (kind === '24h') {
    return {
      subject: '¡Te extrañamos! 🦜',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center;padding:24px;">
          <div style="font-size:48px;">🦜</div>
          <h1 style="color:#1e293b;">¡Hola, ${firstName}!</h1>
          <p style="color:#475569;font-size:16px;">Ayer no te vimos en Quetzal LMS. ¡Tu racha te espera! Entrá hoy para no perderla.</p>
          <a href="${APP_URL}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#059669;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">Volver a entrar</a>
        </div>
      `,
    };
  }
  return {
    subject: 'Ya van varios días... ¿todo bien? 🥺',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center;padding:24px;">
        <div style="font-size:48px;">🥺🦜</div>
        <h1 style="color:#1e293b;">${firstName}, hace días que no te vemos</h1>
        <p style="color:#475569;font-size:16px;">Ya pasaron 3 días desde tu última visita a Quetzal LMS. Tus compañeros siguen avanzando -- ¡volvé cuando puedas!</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#059669;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">Entrar ahora</a>
      </div>
    `,
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401);

  // Modo de prueba: manda un solo correo de muestra a la dirección indicada,
  // sin tocar email_notifications_log ni depender de que alguien esté
  // realmente inactivo -- para verificar Resend/dominio de punta a punta.
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.test_email) {
      const { subject, html } = emailHtml('Billy (prueba)', body.test_kind === '3d' ? '3d' : '24h');
      await sendEmail(body.test_email, `[PRUEBA] ${subject}`, html);
      return json({ ok: true, test: true, sent_to: body.test_email });
    }
  } catch (e) {
    return json({ error: `Fallo el envío de prueba: ${String(e)}` }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  let sent24h = 0, sent3d = 0, errors = 0;

  try {
    const [{ data: students }, { data: teachers }] = await Promise.all([
      admin.from('students').select('id, email, full_name, last_login'),
      admin.from('teachers').select('id, email, full_name, last_login, role').eq('role', 'docente'),
    ]);

    const users = [...(students || []), ...(teachers || [])].filter(u => u.email && u.last_login);

    for (const user of users) {
      const days = daysSince(user.last_login);
      let kind: '24h' | '3d' | null = null;
      if (days >= 3) kind = '3d';
      else if (days >= 1) kind = '24h';
      if (!kind) continue;

      // ¿Ya se mandó este tipo de correo DESPUÉS de su último login? Si sí, no repetir.
      const { data: recentLog } = await admin
        .from('email_notifications_log')
        .select('sent_at')
        .eq('user_id', user.id)
        .eq('notification_type', kind)
        .gte('sent_at', new Date(user.last_login.includes('T') ? user.last_login : user.last_login + 'T00:00:00').toISOString())
        .limit(1)
        .maybeSingle();
      if (recentLog) continue;

      try {
        const { subject, html } = emailHtml(user.full_name, kind);
        await sendEmail(user.email, subject, html);
        await admin.from('email_notifications_log').insert({ user_id: user.id, notification_type: kind });
        if (kind === '24h') sent24h++; else sent3d++;
      } catch (e) {
        console.error(`Error enviando a ${user.email}:`, e);
        errors++;
      }
    }

    return json({ ok: true, sent24h, sent3d, errors, totalChecked: users.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
