// Único punto de navegación permitido en toda la app (D-536): un deep link a
// la app de mapas del dispositivo. No hay mapa interno, no hay GPS, no hay
// librería de mapas.
//
// Vivía dentro de lib/apoyo.js, que era el único módulo que lo usaba. Ahora lo
// necesitan también la sección "Servicios aceptados" del Home (los tres roles),
// MUVET Relevo (N-30) y el historial (N-9), así que se extrae acá. `apoyo.js`
// lo sigue re-exportando para no romper a sus importadores.
//
// N-4 (Constelación) tiene su propia versión con `/dir/?destination=` en vez de
// `/search/?query=`: allí la intención es NAVEGAR hacia el domicilio del tutor
// durante el servicio, no ubicar un punto. Se deja aparte a propósito.

export function mapsUrl(direccion) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion ?? '')}`;
}

// El enlace que se le ofrece al usuario para una ubicación: si quien la
// registró pegó su propio link de Google Maps (sedes de clínica, punto de
// encuentro), ese manda — es más preciso que buscar la dirección como texto.
// Si no hay ninguno de los dos, devuelve null y la UI no pinta el enlace.
export function enlaceUbicacion({ direccion, linkMaps } = {}) {
  const link = (linkMaps ?? '').trim();
  if (link) return link;
  const texto = (direccion ?? '').trim();
  return texto ? mapsUrl(texto) : null;
}
