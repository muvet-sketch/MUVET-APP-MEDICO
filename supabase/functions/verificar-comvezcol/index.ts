// ============================================================================
// MUVET · App Médico — Edge Function: verificar-comvezcol
// ============================================================================
// Consulta el registro público del Consejo Profesional de Medicina Veterinaria
// y Zootecnia de Colombia y decide el estado de validación del médico.
//
// Tres desenlaces posibles (confirmados con el fundador):
//
//   'validado'    → coincidencia inequívoca. Puede activar DISPONIBLE.
//   'en_disputa'  → POSIBLE SUPLANTACIÓN. Queda bloqueado: solo puede
//                   actualizar su perfil y contactar a soporte. Dos señales lo
//                   provocan: (a) la matrícula ya está registrada por otra
//                   cuenta de MUVET, o (b) la matrícula existe en el Consejo
//                   pero a nombre de otra persona.
//   'pendiente'   → no se pudo verificar por cualquier otra razón (no aparece,
//                   respuesta ambigua, error de red). Usa la app con
//                   normalidad mientras se valida a mano; D-541 sigue intacto,
//                   así que aún no puede activar DISPONIBLE.
//
// Esta función NUNCA escribe 'rechazado': rechazar es siempre una decisión
// humana. Ver supabase/migrations/0024 y 0025 para el detalle y para el
// trigger que hace de esta función la ÚNICA escritora de estado_validacion.
//
// El sitio externo (verificado contra el servicio real):
//   POST https://administrador.consejoapp.com.co/index.php/consultas/profesionalesS
//   campos: nombre, apellido, apellido2, cedula, matricula (todos opcionales)
//   sin CSRF, sin captcha, sin autenticación.
//   Responde la misma página HTML con una <table> de resultados cuyas columnas
//   son: Foto | Nombre | Apellidos | Titulo | Acciones. El link "Ver" apunta a
//   .../profesionalesD/{id}/ donde {id} es un ID INTERNO, NO la matrícula
//   (comprobado: buscar 12345 devuelve el link .../12346/). La matrícula
//   autoritativa solo aparece en esa página de detalle, como "Matricula No.".
//
// Dos comportamientos del sitio que obligan a ser estrictos:
//   1. La búsqueda por matrícula es exacta para valores numéricos (buscar 100
//      devuelve 100, no 1000 ni 10000).
//   2. Pero una matrícula NO numérica (p.ej. "abc") devuelve 25 filas de
//      profesionales sin relación con lo buscado — comparación laxa del motor
//      de base de datos del sitio. Un parser ingenuo validaría a cualquiera.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import { nombreConcuerda, normalizar } from './nombres.ts';

const REGISTRO_BASE = 'https://administrador.consejoapp.com.co/index.php/consultas';
const TIMEOUT_MS = 10_000;
// Ventana mínima entre intentos de un mismo médico. Evita que un reintento en
// bucle martille un registro público que no es nuestro.
const THROTTLE_SEGUNDOS = 15;

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

async function postRegistro(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${REGISTRO_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`El registro respondió HTTP ${res.status}`);
  return res.text();
}

async function getRegistro(path: string) {
  const res = await fetch(`${REGISTRO_BASE}/${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`El registro respondió HTTP ${res.status}`);
  return res.text();
}

type Fila = { nombre: string; apellidos: string; titulo: string; detalleId: string | null };

// Extrae las filas de la tabla de resultados. Devuelve [] si no hay tabla
// (caso "sin resultados": el sitio simplemente no renderiza el <table>).
function parsearResultados(html: string): Fila[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) throw new Error('No se pudo parsear el HTML del registro');

  const filas: Fila[] = [];
  for (const tr of doc.querySelectorAll('table tbody tr')) {
    const celdas = (tr as unknown as Element).querySelectorAll('td');
    // Foto | Nombre | Apellidos | Titulo | Acciones
    if (celdas.length < 5) continue;

    const texto = (i: number) => (celdas[i] as unknown as Element).textContent?.trim() ?? '';
    const href = (celdas[4] as unknown as Element).querySelector('a')?.getAttribute('href') ?? '';
    const id = href.match(/profesionalesD\/(\d+)/)?.[1] ?? null;

    filas.push({ nombre: texto(1), apellidos: texto(2), titulo: texto(3), detalleId: id });
  }
  return filas;
}

// Lee "Matricula No." de la página de detalle. Es el único punto del sitio que
// afirma de forma autoritativa a qué matrícula corresponde el registro.
function parsearMatriculaDetalle(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return null;

  for (const tr of doc.querySelectorAll('table tbody tr')) {
    const el = tr as unknown as Element;
    const etiqueta = normalizar(el.querySelector('th')?.textContent ?? '');
    if (etiqueta.startsWith('matricula')) {
      return el.querySelector('td')?.textContent?.trim() ?? null;
    }
  }
  return null;
}

// Aviso al fundador de que hay un caso esperando validación manual.
//
// Best-effort a propósito: si falta configuración o Resend falla, se registra
// en el log y ya. La verificación del médico NO puede depender de que el
// correo salga. La bandeja real y siempre disponible es la vista
// `revision_matriculas_pendientes` (ver 0025).
//
// Requiere estos secrets en Supabase (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  · clave de Resend
//   SOPORTE_EMAIL   · destinatario del aviso
//   RESEND_FROM     · remitente verificado (opcional; por defecto el sandbox
//                     onboarding@resend.dev, que solo entrega al dueño de la
//                     cuenta de Resend hasta que se verifique un dominio)
async function notificarRevisionManual(datos: {
  resultado: string;
  motivo: string;
  medicoId: string;
  nombre: string | null;
  matricula: string;
  nombreEnConsejo: string | null;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const destino = Deno.env.get('SOPORTE_EMAIL');
  if (!apiKey || !destino) {
    console.log('Aviso de revisión manual no enviado: falta RESEND_API_KEY o SOPORTE_EMAIL', datos);
    return;
  }

  const esDisputa = datos.resultado === 'duplicado';
  const asunto = esDisputa
    ? `[MUVET] Posible suplantación — matrícula ${datos.matricula}`
    : `[MUVET] Validación manual pendiente — matrícula ${datos.matricula}`;

  const cuerpo = [
    esDisputa
      ? 'Un médico quedó BLOQUEADO por posible suplantación (estado en_disputa).'
      : 'Un médico necesita validación manual de su matrícula (estado pendiente, usa la app con normalidad).',
    '',
    `Médico:              ${datos.nombre ?? '(sin nombre)'}`,
    `ID:                  ${datos.medicoId}`,
    `Matrícula:           ${datos.matricula}`,
    `Nombre en el Consejo: ${datos.nombreEnConsejo ?? '(no encontrado)'}`,
    `Resultado:           ${datos.resultado}`,
    `Motivo:              ${datos.motivo}`,
    '',
    'Revisa el caso con:',
    '  select * from revision_matriculas_pendientes;',
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
    if (!res.ok) console.log('Resend respondió', res.status, await res.text());
  } catch (err) {
    console.log('No se pudo enviar el aviso de revisión manual:', String(err));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identidad: se toma del JWT, nunca de un medico_id del body. Si viniera del
  // body, cualquier médico podría disparar (y auto-aprobar) la verificación de
  // otro.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'No autenticado' }, 401);

  // Service role: es la ÚNICA vía por la que se escribe estado_validacion (el
  // trigger de 0025 rechaza cualquier otra), y la única que puede insertar en
  // la bitácora validaciones_comvezcol.
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: perfil, error: perfilError } = await admin
    .from('perfiles')
    .select('id, rol, nombre_completo, matricula_comvezcol, estado_validacion')
    .eq('id', user.id)
    .maybeSingle();

  if (perfilError) return json({ error: perfilError.message }, 500);
  if (!perfil) return json({ error: 'Perfil no encontrado' }, 404);
  if (perfil.rol !== 'medico') return json({ error: 'Solo aplica a médicos' }, 400);

  // Ya validado: no se vuelve a consultar el registro externo.
  // 'en_disputa' SÍ se reevalúa: si el médico corrigió su matrícula, esta
  // función es la única que puede sacarlo del bloqueo.
  if (perfil.estado_validacion === 'validado') {
    return json({ resultado: 'validado', estado_validacion: 'validado', sin_cambios: true });
  }

  const matricula = (perfil.matricula_comvezcol ?? '').trim();
  if (!matricula) return json({ error: 'El perfil no tiene matrícula COMVEZCOL' }, 400);

  const { data: ultimo } = await admin
    .from('validaciones_comvezcol')
    .select('created_at')
    .eq('medico_id', perfil.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimo && Date.now() - new Date(ultimo.created_at).getTime() < THROTTLE_SEGUNDOS * 1000) {
    return json({ error: 'Espera unos segundos antes de reintentar' }, 429);
  }

  async function registrar(
    resultado: string,
    nombreEncontrado: string | null,
    detalle: Record<string, unknown>,
  ) {
    await admin.from('validaciones_comvezcol').insert({
      medico_id: perfil!.id,
      resultado,
      matricula_consultada: matricula,
      nombre_encontrado: nombreEncontrado,
      detalle,
    });

    if (resultado !== 'validado') {
      await notificarRevisionManual({
        resultado,
        motivo: String(detalle.motivo ?? ''),
        medicoId: perfil!.id,
        nombre: perfil!.nombre_completo,
        matricula,
        nombreEnConsejo: nombreEncontrado,
      });
    }
  }

  // Marca al médico como posible suplantador: queda bloqueado hasta que una
  // persona resuelva la controversia.
  async function marcarEnDisputa(nombreEncontrado: string | null, detalle: Record<string, unknown>) {
    await admin.from('perfiles').update({ estado_validacion: 'en_disputa' }).eq('id', perfil!.id);
    await registrar('duplicado', nombreEncontrado, detalle);
    return json({ resultado: 'duplicado', estado_validacion: 'en_disputa' });
  }

  // --------------------------------------------------------------------
  // Señal de suplantación (a): la matrícula ya está en otra cuenta MUVET.
  // Se comprueba ANTES de salir a internet — no depende de que el registro
  // externo esté disponible.
  // --------------------------------------------------------------------
  const { data: otrasCuentas } = await admin
    .from('perfiles')
    .select('id, nombre_completo, estado_validacion')
    .eq('matricula_comvezcol', matricula)
    .neq('id', perfil.id);

  if (otrasCuentas && otrasCuentas.length > 0) {
    return await marcarEnDisputa(null, {
      motivo: 'matricula_ya_registrada_en_muvet',
      cuentas_en_conflicto: otrasCuentas.map((c) => c.id),
    });
  }

  // Defensa 1: solo matrículas estrictamente numéricas. Con cualquier otra
  // cosa el sitio devuelve 25 profesionales sin relación con lo consultado.
  if (!/^\d+$/.test(matricula)) {
    await registrar('ambiguo', null, {
      motivo: 'matricula_no_numerica',
      nota: 'El registro público devuelve resultados no relacionados ante entradas no numéricas.',
    });
    return json({ resultado: 'ambiguo', estado_validacion: perfil.estado_validacion });
  }

  try {
    const html = await postRegistro('profesionalesS', {
      nombre: '',
      apellido: '',
      apellido2: '',
      cedula: '',
      matricula,
    });
    const filas = parsearResultados(html);

    if (filas.length === 0) {
      await registrar('sin_coincidencia', null, { motivo: 'sin_filas', filas: 0 });
      return json({ resultado: 'sin_coincidencia', estado_validacion: perfil.estado_validacion });
    }

    // Defensa 2: exactamente una fila. Varias filas para una matrícula
    // numérica no debería ocurrir; si ocurre, la respuesta no es confiable.
    if (filas.length > 1) {
      await registrar('ambiguo', null, { motivo: 'multiples_filas', filas: filas.length });
      return json({ resultado: 'ambiguo', estado_validacion: perfil.estado_validacion });
    }

    const fila = filas[0];
    const nombreRegistro = `${fila.nombre} ${fila.apellidos}`.trim();

    // Defensa 3: confirmar contra la página de detalle que la matrícula del
    // registro encontrado es exactamente la consultada. El listado no la
    // muestra, y el id del link es interno.
    if (!fila.detalleId) {
      await registrar('error', nombreRegistro, { motivo: 'sin_link_detalle' });
      return json({ resultado: 'error', estado_validacion: perfil.estado_validacion });
    }

    const detalleHtml = await getRegistro(`profesionalesD/${fila.detalleId}/`);
    const matriculaDetalle = parsearMatriculaDetalle(detalleHtml);

    if (matriculaDetalle !== matricula) {
      await registrar('ambiguo', nombreRegistro, {
        motivo: 'matricula_detalle_no_coincide',
        matricula_detalle: matriculaDetalle,
      });
      return json({ resultado: 'ambiguo', estado_validacion: perfil.estado_validacion });
    }

    // ------------------------------------------------------------------
    // Señal de suplantación (b): la matrícula es real y existe, pero está a
    // nombre de otra persona. Es la señal MÁS fuerte de las dos: significa
    // que escribió una matrícula ajena verificable.
    // ------------------------------------------------------------------
    if (!nombreConcuerda(perfil.nombre_completo ?? '', nombreRegistro)) {
      return await marcarEnDisputa(nombreRegistro, {
        motivo: 'nombre_no_concuerda',
        nombre_app: perfil.nombre_completo,
        titulo: fila.titulo,
      });
    }

    const { error: updateError } = await admin
      .from('perfiles')
      .update({ estado_validacion: 'validado', fecha_validacion: new Date().toISOString() })
      .eq('id', perfil.id);
    if (updateError) throw updateError;

    await registrar('validado', nombreRegistro, {
      titulo: fila.titulo,
      detalle_id: fila.detalleId,
      nombre_app: perfil.nombre_completo,
    });

    return json({ resultado: 'validado', estado_validacion: 'validado' });
  } catch (err) {
    // Red, timeout o HTML inesperado: se registra y el perfil se queda como
    // estaba (normalmente 'pendiente'). Nunca 'rechazado'.
    await registrar('error', null, { motivo: 'excepcion', mensaje: String(err) });
    return json({ resultado: 'error', estado_validacion: perfil.estado_validacion });
  }
});
