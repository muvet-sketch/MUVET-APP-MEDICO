// Barra Trueta — barra de navegación fija de la Constelación activa (N-10).
// Es un componente, no una pantalla independiente (ver CLAUDE.md/glosario).
//
// -- SUPUESTO: 🎤 IRIS y 📋 SOAP apuntan a la misma pantalla (N-15,
// /soap/:servicioId) porque en el MVP IRIS solo existe como asistente de
// redacción del SOAP (D-552/consentimiento de Apertura) — no hay una
// pantalla IRIS separada en el inventario visto. 💊 Fórmula apunta a N-12.
// -- SUPUESTO (Fase 6): el despacho no especifica desde dónde se lanza N-18
// durante la consulta activa; se agrega aquí (📝 Recomendaciones) siguiendo
// el mismo patrón que el resto de destinos clínicos.
// ✕ Cerrar es el único punto de entrada a N-19 (D-505) — sin confirmación
// intermedia.
import { useNavigate } from 'react-router-dom';

export default function BarraTrueta({ servicioId }) {
  const navigate = useNavigate();

  const items = [
    { key: 'iris', label: '🎤 IRIS', onClick: () => navigate(`/soap/${servicioId}`) },
    { key: 'soap', label: '📋 SOAP', onClick: () => navigate(`/soap/${servicioId}`) },
    { key: 'formula', label: '💊 Fórmula', onClick: () => navigate(`/formula/${servicioId}`) },
    { key: 'ordenes', label: '🔬 Órdenes', onClick: () => navigate(`/ordenes/${servicioId}`) },
    { key: 'recomendaciones', label: '📝 Recomendaciones', onClick: () => navigate(`/recomendaciones/${servicioId}`) },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[430px] items-center justify-around border-t border-[#E1E8ED] bg-white px-2 py-2 pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className="flex flex-1 flex-col items-center gap-1 rounded-[8px] px-2 py-2 text-[11px] font-medium text-[#0A1628] active:bg-[#F4F7F9]"
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => navigate(`/cierre/${servicioId}`)}
        className="flex flex-1 flex-col items-center gap-1 rounded-[8px] px-2 py-2 text-[11px] font-medium text-[#C63B3B] active:bg-[#F4F7F9]"
      >
        ✕ Cerrar
      </button>
    </div>
  );
}
