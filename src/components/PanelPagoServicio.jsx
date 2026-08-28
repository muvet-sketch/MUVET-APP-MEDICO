import { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, Toast } from './ui';
import { formatFechaCorta } from '../lib/format';
import {
  estadoPagoServicio,
  columnaMiOptIn,
  perfilTieneDatosPago,
  filasDatosPago,
  marcarPagoServicio,
  compartirDatosPagoServicio,
  fetchDatosPagoContraparte,
  puedeCompartirDatosPago,
  moduloTienePagos,
} from '../lib/pagos';

// Panel de pago de un servicio, común a MUVET Turnos (ConversacionRelevo) y
// MUVET Auxiliar (ConversacionApoyo), cuando el servicio está confirmado o
// finalizado (migración 0029).
//
// MUVET Relevo (N-30, `cobertura_*`) ya NO lo monta: 0034 lo sacó del control
// de pagos porque ahí el médico que releva le cobra directamente al tutor.
//
// props:
//   modulo            'relevo' | 'apoyo' (ids internos)
//   servicioId        id de la conversación
//   fila              la fila ya cargada del servicio (trae pago_* y autor_id)
//   perfil            perfil del usuario actual
//   nombreContraparte texto para "Datos de pago de …"
//   onCambio          callback opcional tras cada acción (recarga en el padre)
export default function PanelPagoServicio({ modulo, servicioId, fila, perfil, nombreContraparte, onCambio }) {
  // `patch` mantiene el cambio propio en pantalla sin depender de que el padre
  // recargue (el historial N-9 no tiene realtime). Se limpia cuando la fila de
  // afuera ya refleja lo mismo (realtime o recarga).
  const [patch, setPatch] = useState({});
  const filaEfectiva = { ...fila, ...patch };

  const { pagado, marcadoAt, nota: notaGuardada, yoComparto } = estadoPagoServicio(
    modulo,
    filaEfectiva,
    perfil.id,
  );
  const miFlag = columnaMiOptIn(modulo, fila, perfil.id);

  const [nota, setNota] = useState(notaGuardada);
  const [marcando, setMarcando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [datosContraparte, setDatosContraparte] = useState(null);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  const nombre = nombreContraparte || 'la otra parte';
  const tengoDatos = perfilTieneDatosPago(perfil);
  // 0033: los datos de pago los comparte quien COBRA. Quien paga no publica su
  // cuenta bancaria — solo marca el pago y copia los datos del otro.
  const meTocaCompartir = puedeCompartirDatosPago(modulo, filaEfectiva, perfil);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  // La fila de afuera cambió (realtime / recarga del padre): el patch local ya
  // no hace falta y la nota vuelve a la guardada si no se está editando.
  useEffect(() => {
    setPatch({});
  }, [
    fila?.pago_estado,
    fila?.pago_marcado_at,
    fila?.pago_datos_autor,
    fila?.pago_datos_interesado,
    fila?.pago_datos_cobertura,
  ]);

  useEffect(() => {
    setNota((actual) => (actual === '' || actual === notaGuardada ? notaGuardada : actual));
  }, [notaGuardada]);

  // Los datos de la contraparte dependen de que ELLA haya hecho opt-in.
  useEffect(() => {
    let activo = true;
    fetchDatosPagoContraparte(modulo, servicioId)
      .then((d) => {
        if (activo) setDatosContraparte(d);
      })
      .catch(() => {
        if (activo) setDatosContraparte(null);
      });
    return () => {
      activo = false;
    };
  }, [modulo, servicioId, fila?.pago_datos_autor, fila?.pago_datos_interesado, fila?.pago_datos_cobertura]);

  async function handleMarcar() {
    const nuevo = !pagado;
    setMarcando(true);
    try {
      await marcarPagoServicio(modulo, servicioId, nuevo, nota);
      setPatch((p) => ({
        ...p,
        pago_estado: nuevo ? 'pagado' : 'pendiente',
        pago_marcado_por: nuevo ? perfil.id : null,
        pago_marcado_at: nuevo ? new Date().toISOString() : null,
      }));
      showToast(nuevo ? 'Servicio marcado como pagado.' : 'Servicio marcado como pendiente.', 'ok');
      await onCambio?.();
    } catch (err) {
      showToast(err.message ?? 'No se pudo actualizar el pago.', 'critical');
    } finally {
      setMarcando(false);
    }
  }

  async function handleCompartir() {
    const nuevo = !yoComparto;
    setCompartiendo(true);
    try {
      await compartirDatosPagoServicio(modulo, servicioId, nuevo);
      setPatch((p) => ({ ...p, [miFlag]: nuevo }));
      showToast(nuevo ? 'Compartiste tus datos de pago.' : 'Dejaste de compartir tus datos.', 'ok');
      await onCambio?.();
    } catch (err) {
      showToast(err.message ?? 'No se pudo actualizar.', 'critical');
    } finally {
      setCompartiendo(false);
    }
  }

  const copiar = useCallback((texto) => {
    navigator.clipboard?.writeText(texto).then(
      () => setToast({ message: 'Copiado.', tone: 'ok', visible: true }),
      () => setToast({ message: 'No se pudo copiar.', tone: 'critical', visible: true }),
    );
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  const filasDatos = filasDatosPago(datosContraparte);

  // Red de seguridad para un módulo sin control de pagos (hoy 'cobertura', que
  // salió en 0034). Va DESPUÉS de los hooks: sacarlo arriba rompería el orden.
  if (!moduloTienePagos(modulo)) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#0A1628]">Pago del servicio</p>
        <Badge tone={pagado ? 'ok' : 'alert'}>
          {pagado ? `Pagado${marcadoAt ? ` · ${formatFechaCorta(marcadoAt)}` : ''}` : 'Pendiente de pago'}
        </Badge>
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Monto, medio o referencia (opcional)"
        className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
      />

      <Button variant={pagado ? 'ghost' : 'secondary'} disabled={marcando} onClick={handleMarcar}>
        {marcando ? 'Guardando…' : pagado ? 'Marcar como pendiente' : 'Marcar como pagado'}
      </Button>

      {meTocaCompartir && (
        <div className="border-t border-[#E1E8ED] pt-3">
          <p className="text-[12px] font-medium text-[#5A6B7A]">Mis datos de pago</p>
          {tengoDatos ? (
            <Button
              variant="outline"
              fullWidth={false}
              className="mt-2 !w-auto px-3 py-2 text-[13px]"
              disabled={compartiendo}
              onClick={handleCompartir}
            >
              {compartiendo
                ? 'Guardando…'
                : yoComparto
                  ? 'Dejar de compartir mis datos'
                  : 'Compartir mis datos de pago'}
            </Button>
          ) : (
            <p className="mt-1 text-[12px] text-[#5A6B7A]">
              Configúralos en tu perfil para poder compartirlos con la otra parte.
            </p>
          )}
        </div>
      )}

      {/* El otro lado del mismo criterio: quien cobra no necesita la cuenta de
          quien paga, y dejarle un "aún no compartió sus datos" que nunca se va
          a resolver solo confunde. */}
      {!meTocaCompartir && (
      <div className="border-t border-[#E1E8ED] pt-3">
        <p className="text-[12px] font-medium text-[#5A6B7A]">Datos de pago de {nombre}</p>
        {filasDatos.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {filasDatos.map((f) => (
              <div key={f.label} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#5A6B7A]">{f.label}</p>
                  {f.esLink ? (
                    <a
                      href={f.valor}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[13px] text-[#1A7A5E] underline"
                    >
                      {f.valor}
                    </a>
                  ) : (
                    <p className="truncate text-[13px] text-[#0A1628]">{f.valor}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copiar(f.valor)}
                  className="shrink-0 text-[12px] font-medium text-[#1A7A5E]"
                >
                  Copiar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-[#5A6B7A]">{nombre} aún no compartió sus datos de pago.</p>
        )}
      </div>
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
