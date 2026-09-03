// ============================================================================
// MUVET · App Médico — Edge Function: notificar-sugerencia
// ============================================================================
// Avisa al fundador por correo cada vez que un usuario envía una recomendación
// desde "Ayúdanos a Mejorar" (N-33, tabla sugerencias_mejora, migración 0036).
//
// La bandeja real y siempre disponible sigue siendo la vista
// `sugerencias_mejora_pendientes` del Dashboard (0036 §4); este correo es solo
// un aviso. Por eso es BEST-EFFORT a propósito: si faltan los secrets de Resend
// o Resend falla, se registra en el log y la función responde 200 igual. El
// cliente ([src/lib/mejoras.js]) tampoco bloquea el flujo si esto falla — la
// sugerencia ya quedó guardada.
//
// Identidad SIEMPRE desde el JWT, nunca del body: el body solo trae el id de la
// fila y además se exige `perfil_id = auth.uid()` al leerla, así que nadie
// puede disparar el correo de la sugerencia de otra persona.
//
// Espejo de `notificarRevisionManual` en verificar-comvezcol/index.ts.
// Requiere estos secrets (Dashboard → Edge Functions → Secrets), los mismos que
// ya usa verificar-comvezcol:
//   RESEND_API_KEY  · clave de Resend
//   SOPORTE_EMAIL   · destinatario del aviso
//   RESEND_FROM     · remitente verificado (opcional; por defecto el sandbox
//                     onboarding@resend.dev, que solo entrega al dueño de la
//                     cuenta de Resend hasta que se verifique un dominio)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'sugerencias-mejora';
const TIMEOUT_MS = 10_000;
// Enlaces firmados a las imágenes del bucket privado: 7 días de validez.
const FIRMA_SEGUNDOS = 604_800;

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
  texto: string;
  quien: string;
  rol: string;
  enlaces: string[];
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const destino = Deno.env.get('SOPORTE_EMAIL');
  if (!apiKey || !destino) {
    console.log(
      'Aviso de sugerencia no enviado: falta RESEND_API_KEY o SOPORTE_EMAIL',
      { id: datos.id },
    );
    return false;
  }

  const asunto = `[MUVET] Nueva sugerencia — ${datos.quien}`;

  const cuerpo = [
    'Un usuario envió una recomendación de producto desde "Ayúdanos a Mejorar".',
    '',
    `De:     ${datos.quien}`,
    `Rol:    ${datos.rol}`,
    `Fecha:  ${datos.createdAt}`,
    `ID:     ${datos.id}`,
    '',
    'Recomendación:',
    datos.texto,
    '',
    datos.enlaces.length
      ? `${datos.enlaces.length} imagen(es) adjunta(s) (enlaces válidos 7 días):`
      : 'Sin imágenes adjuntas.',
    ...datos.enlaces.map((u) => `  ${u}`),
    '',
    'Bandeja completa:  select * from sugerencias_mejora_pendientes;',
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
    console.log('No se pudo enviar el aviso de sugerencia:', String(err));
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

  let body: { sugerenciaId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sugerenciaId = String(body?.sugerenciaId ?? '');
  if (!UUID_RE.test(sugerenciaId)) {
    return json({ error: 'sugerenciaId inválido' }, 400);
  }

  // Service role: para leer la fila con su perfil y firmar las imágenes del
  // bucket privado. El filtro perfil_id = user.id evita que alguien dispare el
  // correo de la sugerencia de otro.
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: fila, error: filaError } = await admin
    .from('sugerencias_mejora')
    .select(
      'id, created_at, texto, imagenes, perfil_id, perfiles ( nombre_completo, razon_social, rol )',
    )
    .eq('id', sugerenciaId)
    .eq('perfil_id', user.id)
    .maybeSingle();

  if (filaError) return json({ error: filaError.message }, 500);
  if (!fila) return json({ error: 'Sugerencia no encontrada' }, 404);

  const perfil = (fila.perfiles ?? {}) as {
    nombre_completo?: string | null;
    razon_social?: string | null;
    rol?: string | null;
  };

  const enlaces: string[] = [];
  for (const path of (fila.imagenes ?? []) as string[]) {
    const { data: firma } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, FIRMA_SEGUNDOS);
    if (firma?.signedUrl) enlaces.push(firma.signedUrl);
  }

  const enviado = await enviarAviso({
    id: fila.id,
    createdAt: fila.created_at,
    texto: fila.texto,
    quien: perfil.nombre_completo ?? perfil.razon_social ?? '(sin nombre)',
    rol: perfil.rol ?? '(desconocido)',
    enlaces,
  });

  return json({ ok: true, enviado });
});
