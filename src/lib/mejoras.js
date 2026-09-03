import { supabase } from './supabase';

// "Ayúdanos a Mejorar" (N-33, migración 0036) — recomendaciones de producto de
// cualquiera de los 3 actores. El feedback lo lee el fundador por el Dashboard
// (vista sugerencias_mejora_pendientes); no se responde al usuario dentro de la
// app y la pantalla tampoco lista lo ya enviado, así que acá solo se escribe:
// se sube al bucket, se inserta la fila y se dispara un aviso por correo
// best-effort (Edge Function notificar-sugerencia). Ningún fetch de lectura.
//
// Espejo de lib/soporte.js, más imágenes en el bucket privado
// 'sugerencias-mejora' (owner-folder `${perfil_id}/...`, ver 0036).

const BUCKET = 'sugerencias-mejora';

// Devuelve el PATH, nunca una url: el bucket es privado y la url pública no
// existe. La policy de insert de storage.objects exige que el primer segmento
// sea auth.uid(), y perfiles.id = auth.uid() (0001), así que va el perfil.
export async function subirImagenSugerencia(perfilId, file, i) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${perfilId}/${Date.now()}-${i}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

// Sube las imágenes ANTES de insertar la fila, para no dejar una recomendación
// que promete adjuntos que nunca llegaron. Secuencial y no Promise.all: son 4
// como máximo y así se corta en la primera que falle, con su mensaje.
//
// Si el insert falla después de subir, las imágenes quedan huérfanas en
// Storage. Se acepta — mismo criterio que los adjuntos de lib/coberturaServicio
// — y se limpian a mano; no hay transacción posible entre Storage y Postgres.
export async function crearSugerencia({ perfilId, texto, imagenes = [] }) {
  const paths = [];
  for (let i = 0; i < imagenes.length; i += 1) {
    paths.push(await subirImagenSugerencia(perfilId, imagenes[i], i));
  }

  const { data, error } = await supabase
    .from('sugerencias_mejora')
    .insert({ perfil_id: perfilId, texto, imagenes: paths })
    .select()
    .single();
  if (error) throw error;

  // Aviso por correo al fundador (best-effort, mismo patrón que
  // verificacionComvezcol.js). La sugerencia ya quedó guardada y visible en
  // sugerencias_mejora_pendientes aunque esto falle, así que no se propaga.
  try {
    await supabase.functions.invoke('notificar-sugerencia', {
      body: { sugerenciaId: data.id },
    });
  } catch (err) {
    console.warn('No se pudo enviar el aviso de sugerencia:', err);
  }

  return data;
}
