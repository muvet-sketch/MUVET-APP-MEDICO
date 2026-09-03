// ============================================================================
// MUVET · App Médico — Edge Function: notificar-soporte
// ============================================================================
// Avisa al fundador por correo cada vez que un usuario envía un ticket desde la
// pantalla de Soporte (tabla soporte_tickets, migración 0025 §5). Hoy el caso
// de uso principal es un médico bloqueado por posible suplantación
// ('en_disputa') que necesita resolver la controversia, pero la pantalla
// también es el canal de soporte general para cualquier rol.
//
// La bandeja real sigue siendo el Dashboard: `select * from
// revision_matriculas_pendientes;` (0025 §6) trae, entre otras cosas, cuántos
// tickets abiertos tiene cada médico. Este correo es solo un aviso, así que es
// BEST-EFFORT: si faltan los secrets de Resend o Resend falla, se registra en
// el log y la función responde 200 igual. El cliente ([src/lib/soporte.js])
// tampoco bloquea el flujo si esto falla — el ticket ya quedó guardado.
//
// Identidad SIEMPRE desde el JWT, nunca del body: el body solo trae el id del
// ticket y además se exige `perfil_id = auth.uid()` al leerlo. Un perfil
// 'en_disputa' conserva su sesión válida, así que puede invocar esta función.
//
// Espejo de notificar-sugerencia / `notificarRevisionManual`. Reusa los mismos
// secrets (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  · clave de Resend
//   SOPORTE_EMAIL   · destinatario del aviso
//   RESEND_FROM     · remitente verificado (opcional; por defecto el sandbox
//                     onboarding@resend.dev)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TIMEOUT_MS = 10_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Aviso al fundador. Devuelve true solo si Resend aceptó el correo.
async function enviarAviso(datos: {
  id: string;
  createdAt: string;
  motivo: string;
  mensaje: string;
  quien: string;
  rol: string;
  telefono: string;
  matricula: string;
  estadoValidacion: string;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const destino = Deno.env.get('SOPORTE_EMAIL');
  if (!apiKey || !destino) {
    console.log(
      'Aviso de soporte no enviado: falta RESEND_API_KEY o SOPORTE_EMAIL',
      { id: datos.id },
    );
    return false;
  }

  const asunto = `[MUVET] Nuevo ticket de soporte — ${datos.quien}`;

  const cuerpo = [
    'Un usuario abrió un ticket de soporte.',
    '',
    `De:        ${datos.quien}`,
    `Rol:       ${datos.rol}`,
    `Teléfono:  ${datos.telefono}`,
    `Matrícula: ${datos.matricula}`,
    `Validación: ${datos.estadoValidacion}`,
    `Motivo:    ${datos.motivo}`,
    `Fecha:     ${datos.createdAt}`,
    `ID:        ${datos.id}`,
    '',
    'Mensaje:',
    datos.mensaje,
    '',
    'Bandeja completa:  select * from revision_matriculas_pendientes;',
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'MUVET <onboarding@resend.dev>',
        to: [destino],
        subject: asunto,
        text: cuerpo,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.log('Resend respondió', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.log('No se pudo enviar el aviso de soporte:', String(err));
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identidad: del JWT entrante, nunca del body.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'No autenticado' }, 401);

  let body: { ticketId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ticketId = String(body?.ticketId ?? '');
  if (!UUID_RE.test(ticketId)) {
    return json({ error: 'ticketId inválido' }, 400);
  }

  // Service role: leer el ticket con su perfil. El filtro perfil_id = user.id
  // evita que alguien dispare el correo del ticket de otro.
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: fila, error: filaError } = await admin
    .from('soporte_tickets')
    .select(
      'id, created_at, motivo, mensaje, perfil_id, ' +
        'perfiles ( nombre_completo, razon_social, rol, telefono, matricula_comvezcol, estado_validacion )',
    )
    .eq('id', ticketId)
    .eq('perfil_id', user.id)
    .maybeSingle();

  if (filaError) return json({ error: filaError.message }, 500);
  if (!fila) return json({ error: 'Ticket no encontrado' }, 404);

  const perfil = (fila.perfiles ?? {}) as {
    nombre_completo?: string | null;
    razon_social?: string | null;
    rol?: string | null;
    telefono?: string | null;
    matricula_comvezcol?: string | null;
    estado_validacion?: string | null;
  };

  const enviado = await enviarAviso({
    id: fila.id,
    createdAt: fila.created_at,
    motivo: fila.motivo ?? '(sin motivo)',
    mensaje: fila.mensaje,
    quien: perfil.nombre_completo ?? perfil.razon_social ?? '(sin nombre)',
    rol: perfil.rol ?? '(desconocido)',
    telefono: perfil.telefono ?? '(sin teléfono)',
    matricula: perfil.matricula_comvezcol ?? '(sin matrícula)',
    estadoValidacion: perfil.estado_validacion ?? '(desconocido)',
  });

  return json({ ok: true, enviado });
});
