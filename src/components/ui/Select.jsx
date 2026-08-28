// Desplegable de una sola opción. Vivía como componente local dentro de
// n30-cobertura-servicio/SolicitudForm.jsx; se sube acá porque ahora lo usan
// también las sedes de la clínica (N-29), el registro (N-1) y el formulario de
// oferta (N-26).
//
// `options` admite strings ('Bogotá D.C.') o pares { value, label } — las sedes
// necesitan lo segundo porque se elige por id y se muestra "Sede Norte · Bello".
export default function Select({ label, hint, options = [], placeholder, className = '', id, ...props }) {
  const selectId = id ?? props.name;
  return (
    <div className="w-full text-left">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E] ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const value = typeof o === 'string' ? o : o.value;
          const texto = typeof o === 'string' ? o : o.label;
          return (
            <option key={value} value={value}>
              {texto}
            </option>
          );
        })}
      </select>
      {hint && <p className="mt-1 text-[11px] text-[#5A6B7A]">{hint}</p>}
    </div>
  );
}
