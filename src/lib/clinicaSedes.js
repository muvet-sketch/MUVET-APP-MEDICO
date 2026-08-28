import { supabase } from './supabase';
import { ZONAS_COBERTURA, serializarZonas } from './municipios';

// Sedes de una clínica (migración 0030).
//
// Una clínica veterinaria puede tener varios establecimientos, y hasta ahora su
// única ubicación era `perfiles.direccion_sede`: una dirección de calle en
// texto libre. Eso rompía el filtro de cercanía de MUVET Turnos — la oferta
// copiaba esa dirección a `relevo_publicaciones.zona`, y el filtro la compara
// contra el catálogo cerrado de lib/municipios.js, así que nunca coincidía y
// las ofertas de clínicas quedaban invisibles para médicos y auxiliares.
//
// Cada sede separa las dos cosas que antes iban revueltas:
//
//   `ciudad`     valor del catálogo. Es lo PÚBLICO: se copia a la `zona` de la
//                oferta y es lo que alimenta el filtro de cercanía.
//   `direccion`  la dirección exacta. Es lo PRIVADO: no se revela hasta que la
//                conversación queda 'aceptada' (D-064). El control es de
//                backend — RLS de `clinica_sedes` + el gate dentro de
//                `relevo_ficha_contacto` (0030 §4), no de esta capa.
//
// `link_maps` es opcional: el link de Google Maps que la propia clínica pega,
// para abrirlo tal cual en la app de mapas (D-536, ver lib/mapas.js). Sin mapa
// interno ni GPS.

export async function fetchSedes(clinicaId) {
  if (!clinicaId) return [];
  const { data, error } = await supabase
    .from('clinica_sedes')
    .select('*')
    .eq('clinica_id', clinicaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function validar({ etiqueta, direccion }) {
  if (!(etiqueta ?? '').trim()) throw new Error('Ponle un nombre a la sede (ej: Sede Norte).');
  if (!(direccion ?? '').trim()) throw new Error('Escribe la dirección de la sede.');
}

// La ciudad se valida contra el catálogo antes de guardar: si entra un valor de
// fuera, la sede queda muda para el filtro sin que nadie se entere. Mejor
// rechazarla acá que dejar una oferta que nadie ve.
function normalizarCiudad(ciudad) {
  const valor = (ciudad ?? '').trim();
  if (!valor) return null;
  if (!ZONAS_COBERTURA.includes(valor)) {
    throw new Error('Elige la ciudad de la lista para que tus ofertas aparezcan en las búsquedas.');
  }
  return valor;
}

export async function crearSede({ clinicaId, etiqueta, ciudad, direccion, linkMaps }) {
  validar({ etiqueta, direccion });
  const { data, error } = await supabase
    .from('clinica_sedes')
    .insert({
      clinica_id: clinicaId,
      etiqueta: etiqueta.trim(),
      ciudad: normalizarCiudad(ciudad),
      direccion: direccion.trim(),
      link_maps: (linkMaps ?? '').trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarSede(id, clinicaId, { etiqueta, ciudad, direccion, linkMaps }) {
  validar({ etiqueta, direccion });
  const { data, error } = await supabase
    .from('clinica_sedes')
    .update({
      etiqueta: etiqueta.trim(),
      ciudad: normalizarCiudad(ciudad),
      direccion: direccion.trim(),
      link_maps: (linkMaps ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('clinica_id', clinicaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Las ofertas que apuntaban a esta sede NO se borran: `sede_id` es
// `on delete set null` (0030 §3) y conservan la `zona` que ya copiaron.
export async function eliminarSede(id, clinicaId) {
  const { error } = await supabase.from('clinica_sedes').delete().eq('id', id).eq('clinica_id', clinicaId);
  if (error) throw error;
}

// Solo estas sirven para publicar: sin ciudad, la oferta no puede entrar al
// filtro de cercanía. El backfill de 0030 §2 deja las sedes preexistentes sin
// ciudad a propósito (no se puede adivinar desde una dirección de texto libre),
// así que este caso es real y hay que guiarlo, no esconderlo.
export function sedesPublicables(sedes) {
  return (sedes ?? []).filter((s) => (s.ciudad ?? '').trim());
}

// La cercanía funciona en los DOS sentidos, y por eso las ciudades de las sedes
// se copian a `perfiles.zona_cobertura`:
//
//   · Hacia afuera, la ciudad viaja en la `zona` de cada oferta y es lo que
//     hace que médicos y auxiliares cercanos la vean.
//   · Hacia adentro, `zona_cobertura` es lo que TabOfertas usa para filtrar lo
//     que la propia clínica ve. Hasta 0030 quedaba en null para clínicas (ver
//     ActorProfileForm), así que la clínica veía el tablón entero, del país
//     completo.
//
// Se llama después de cada alta/edición/borrado de sede para que las dos caras
// no se desincronicen.
export async function sincronizarZonaCobertura(clinicaId, sedes) {
  const ciudades = Array.from(
    new Set((sedes ?? []).map((s) => (s.ciudad ?? '').trim()).filter(Boolean)),
  );
  const { error } = await supabase
    .from('perfiles')
    .update({ zona_cobertura: serializarZonas(ciudades) })
    .eq('id', clinicaId);
  if (error) throw error;
}

export function etiquetaSede(sede) {
  if (!sede) return '';
  return sede.ciudad ? `${sede.etiqueta} · ${sede.ciudad}` : sede.etiqueta;
}
