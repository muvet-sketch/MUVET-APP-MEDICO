const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCOP(value) {
  return cop.format(Number(value) || 0);
}

export function getInitials(nombreCompleto) {
  if (!nombreCompleto) return '';
  return nombreCompleto
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '';
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return '';

  const hoy = new Date();
  let anios = hoy.getFullYear() - nacimiento.getFullYear();
  let meses = hoy.getMonth() - nacimiento.getMonth();
  if (hoy.getDate() < nacimiento.getDate()) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  if (anios < 0) return '';

  if (anios === 0) {
    return meses <= 0 ? 'Recién nacido' : `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  }
  if (meses === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return `${anios} ${anios === 1 ? 'año' : 'años'} ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

export function formatFechaCorta(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function truncarTexto(texto, maxLength = 200) {
  if (!texto) return '';
  if (texto.length <= maxLength) return texto;
  return `${texto.slice(0, maxLength).trimEnd()}…`;
}
