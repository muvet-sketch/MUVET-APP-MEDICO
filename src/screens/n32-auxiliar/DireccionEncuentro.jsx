import { useState } from 'react';
import { Card, Input, Button } from '../../components/ui';
import { guardarDireccionEncuentro, mapsUrl } from '../../lib/apoyo';

// Punto de encuentro del servicio (N-32).
//
// Lo escribe el MÉDICO —sea autor o interesado de la conversación, depende de
// quién publicó— y el auxiliar solo lo ve una vez ambos están de acuerdo.
//
// Ese control NO vive aquí: la policy de select de `apoyo_direccion` (0028)
// devuelve cero filas al auxiliar antes del acuerdo, así que a esta pantalla
// llega `direccion = null` y no hay nada que esconder. Esconderlo también en
// la UI sería una segunda capa, no la capa. Mismo criterio que D-064.
//
// Sin mapa interno ni GPS (D-536): el único enlace permitido es el deep link a
// la app de mapas del dispositivo.
export default function DireccionEncuentro({
  conversacionId,
  direccion,
  soyElMedico,
  editable,
  onGuardada,
  showToast,
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(direccion?.direccion_encuentro ?? '');
  const [referencia, setReferencia] = useState(direccion?.referencia ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      const guardada = await guardarDireccionEncuentro({
        conversacionId,
        direccion: texto,
        referencia,
      });
      onGuardada(guardada);
      setEditando(false);
      showToast('Punto de encuentro guardado.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la dirección.');
    } finally {
      setGuardando(false);
    }
  }

  // El auxiliar antes del acuerdo: el backend no le manda nada.
  if (!direccion && !soyElMedico) {
    return (
      <Card className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
        <p className="text-[12px] text-[#5A6B7A]">
          Se comparte cuando ambos confirmen el acuerdo.
        </p>
      </Card>
    );
  }

  if (editando || (!direccion && soyElMedico && editable)) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
        <p className="text-[11px] text-[#5A6B7A]">
          Solo tú lo ves hasta que ambos confirmen el acuerdo.
        </p>
        <Input
          label="Dirección"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Calle 63 #11-24, Bogotá"
        />
        <Input
          label="Referencia (opcional)"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Portería, torre, piso…"
        />
        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        <div className="flex gap-2">
          {direccion && (
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
          )}
          <Button onClick={handleGuardar} disabled={guardando || !texto.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
      <p className="text-[14px] text-[#0A1628]">{direccion.direccion_encuentro}</p>
      {direccion.referencia && (
        <p className="text-[12px] text-[#5A6B7A]">{direccion.referencia}</p>
      )}
      <a
        href={mapsUrl(direccion.direccion_encuentro)}
        target="_blank"
        rel="noreferrer"
        className="text-[13px] font-medium text-[#1A7A5E]"
      >
        Abrir en la app de mapas →
      </a>
      {soyElMedico && editable && (
        <Button variant="outline" onClick={() => setEditando(true)}>
          Editar dirección
        </Button>
      )}
    </Card>
  );
}
