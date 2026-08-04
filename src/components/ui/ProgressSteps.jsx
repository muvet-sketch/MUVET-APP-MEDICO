// Barra de progreso de pasos (N-26 · Mi Oferta). `currentIndex` es 0-based
// sobre `steps`; null significa "sin barra" (p.ej. una oferta cancelada, que
// no tiene un avance que mostrar — ver calcularPasoPublicacion en lib/relevo.js).
export default function ProgressSteps({ steps, currentIndex }) {
  if (currentIndex == null) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const alcanzado = i <= currentIndex;
          // El último paso, al alcanzarse, ya no es "en curso" (no hay nada
          // después) — se muestra como completado (✓) igual que los previos.
          const completado = i < currentIndex || (i === currentIndex && i === steps.length - 1);
          return (
            <div key={step} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  alcanzado ? 'bg-[#1A7A5E] text-white' : 'bg-[#E1E8ED] text-[#5A6B7A]'
                }`}
              >
                {completado ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-[2px] flex-1 ${i < currentIndex ? 'bg-[#1A7A5E]' : 'bg-[#E1E8ED]'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between gap-1">
        {steps.map((step, i) => (
          <span
            key={step}
            className={`flex-1 text-center text-[9px] leading-tight ${
              i === currentIndex ? 'font-semibold text-[#0A1628]' : 'text-[#5A6B7A]'
            } ${i === 0 ? 'text-left' : ''} ${i === steps.length - 1 ? 'text-right' : ''}`}
          >
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
