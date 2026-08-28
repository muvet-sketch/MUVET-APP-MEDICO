import { useState } from 'react';
import { Card, Input, Button } from '../../components/ui';
import { guardarDireccionCobertura } from '../../lib/coberturaServicio';
import { enlaceUbicacion } from '../../lib/mapas';

// Punto de encuentro de MUVET Relevo (N-30, tablas cobertura_* — ver
// lib/nombresModulos.js). Migración 0032.
//
// Lo escribe el AUTOR de la solicitud (el médico que pasa el servicio) y el que
// releva solo lo ve una vez el relevo está confirmado por las DOS partes. Ese
// control NO vive acá: la policy de select de `cobertura_direccion` le devuelve
// cero filas antes de 'cubierta', así que a esta pantalla llega
// `direccion = null` y no hay nada que esconder. Mismo criterio que D-064 y que
// DireccionEncuentro de N-32.
//
// 0034: 'cubierta' pasó a significar "ambos de acuerdo", no "alguien se
// ofreció", así que el dato se revela más tarde que antes, no más temprano.
//
// Sin mapa interno ni GPS (D-536): el único enlace permitido es el deep link a
// la app de mapas del dispositivo.
export default function DireccionEncuentroCobertura({
  solicitudId,
  direccion,
  soyElAutor,
  tomada,
  editable,
  onGuardada,
  showToast,
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(direccion?.direccion_encuentro ?? '');
  const [referencia, setReferencia] = useState(direccion?.referencia ?? '');
  const [linkMaps, setLinkMaps] = useState(direccion?.link_maps ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      const guardada = await guardarDireccionCobertura({
        solicitudId,
        direccion: texto,
        referencia,
        linkMaps,
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

  // El que cubre, sin dirección todavía. Igual que en N-32, se distingue "aún
  // no la tomaste" de "el autor no la ha escrito" — decir lo mismo en los dos
  // casos hacía pensar que faltaba algo propio.
  if (!direccion && !soyElAutor) {
    return (
      <Card className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
        <p className="text-[12px] text-[#5A6B7A]">
          {tomada
            ? 'El médico que publicó el servicio todavía no lo ha compartido. Aparecerá acá apenas lo haga; puedes pedírselo por el chat.'
            : 'Se comparte cuando el relevo quede confirmado por los dos.'}
        </p>
      </Card>
    );
  }

  if (editando || (!direccion && soyElAutor && editable)) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
        {tomada ? (
          <p className="text-[11px] font-medium text-[#B4770F]">
            El relevo ya está confirmado y el otro médico todavía no tiene la dirección. En cuanto la
            guardes la verá, y si la cambias también.
          </p>
        ) : (
          <p className="text-[11px] text-[#5A6B7A]">
            Solo tú lo ves hasta que el relevo quede confirmado por los dos.
          </p>
        )}
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
        <Input
          label="Link de Google Maps (opcional)"
          value={linkMaps}
          onChange={(e) => setLinkMaps(e.target.value)}
          placeholder="Pega el enlace de la ubicación"
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

  if (!direccion) return null;

  const enlace = enlaceUbicacion({
    direccion: direccion.direccion_encuentro,
    linkMaps: direccion.link_maps,
  });

  return (
    <Card className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-[#0A1628]">📍 Punto de encuentro</p>
      <p className="text-[14px] text-[#0A1628]">{direccion.direccion_encuentro}</p>
      {direccion.referencia && <p className="text-[12px] text-[#5A6B7A]">{direccion.referencia}</p>}
      {enlace && (
        <a href={enlace} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-[#1A7A5E]">
          Abrir en la app de mapas →
        </a>
      )}
      {soyElAutor && editable && (
        <Button variant="outline" onClick={() => setEditando(true)}>
          Editar dirección
        </Button>
      )}
    </Card>
  );
}
