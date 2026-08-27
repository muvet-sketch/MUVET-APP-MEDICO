import { useState } from 'react';

// Selección múltiple en chips. Extraído del formulario de oferta (N-26) para
// poder reusar el mismo control en los catálogos de habilidades (0015) y en
// "Zona / Ciudad", que aparecen tanto en la oferta como en la configuración
// del perfil.
//
// `collapsible`: arranca COLAPSADO mostrando solo los valores ya elegidos (los
// que normalmente vienen del perfil), con un botón "Modificar" que despliega
// el catálogo completo para cambiarlos. Pensado para catálogos largos
// (habilidades, municipios/zonas) que de otro modo empujan el resto del
// formulario. Si todavía no hay nada elegido, el colapsado invita a abrir.
//
// `searchable`: agrega un buscador de texto que filtra las opciones visibles.
// Se puede combinar con `collapsible` — el buscador solo aparece una vez
// desplegado el catálogo.
//
// `allowCustom`: agrega un campo de texto para sumar valores que no están en
// `options` (p. ej. habilidades nuevas que el usuario quiere declarar). Los
// valores custom ya elegidos se muestran como chips igual que los del
// catálogo, aunque no estén en `options`. En modo `collapsible` el campo solo
// aparece con el catálogo desplegado.
export default function ChipMultiSelect({
  label,
  hint,
  options,
  value = [],
  onChange,
  disabled = false,
  collapsible = false,
  searchable = false,
  allowCustom = false,
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const [busqueda, setBusqueda] = useState('');
  const [nuevoValor, setNuevoValor] = useState('');

  function toggle(option) {
    if (disabled) return;
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  function agregarCustom() {
    if (disabled) return;
    const v = nuevoValor.trim();
    if (!v || value.includes(v)) {
      setNuevoValor('');
      return;
    }
    onChange([...value, v]);
    setNuevoValor('');
  }

  // Une el catálogo con los valores custom ya elegidos (que no están en
  // `options`) para que sus chips no desaparezcan de la lista.
  const todasLasOpciones = allowCustom
    ? [...options, ...value.filter((v) => !options.includes(v))]
    : options;

  const visibles = searchable
    ? todasLasOpciones.filter((o) => o.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : todasLasOpciones;

  // Las opciones ya elegidas se fijan al inicio de la lista (mismo orden del
  // catálogo entre ellas) para que no haya que buscarlas de nuevo entre las
  // demás — piden quedarse "en la cabecera" tanto acá como en el catálogo de
  // habilidades, que comparte este mismo componente.
  const ordenados = [...visibles.filter((o) => value.includes(o)), ...visibles.filter((o) => !value.includes(o))];

  // Modo colapsado: solo los chips ya elegidos, sin buscador ni catálogo. El
  // orden respeta el del catálogo y deja los valores custom al final.
  const colapsado = collapsible && !expanded;
  const seleccionadosOrdenados = [
    ...options.filter((o) => value.includes(o)),
    ...value.filter((v) => !options.includes(v)),
  ];

  function renderChip(option) {
    const selected = value.includes(option);
    return (
      <button
        key={option}
        type="button"
        onClick={() => toggle(option)}
        disabled={disabled}
        aria-pressed={selected}
        className={`shrink-0 rounded-[10px] border px-3 py-2 text-[12px] disabled:opacity-50 ${
          selected ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
        }`}
      >
        {selected ? '✓ ' : ''}
        {option}
      </button>
    );
  }

  return (
    <div className="w-full text-left">
      {label && <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">{label}</label>}
      {hint && <p className="mb-2 text-[11px] text-[#5A6B7A]">{hint}</p>}

      {colapsado ? (
        <div className="flex flex-wrap gap-2">
          {seleccionadosOrdenados.length === 0 ? (
            <p className="text-[12px] text-[#5A6B7A]">Ninguna seleccionada.</p>
          ) : (
            seleccionadosOrdenados.map((option) => renderChip(option))
          )}
        </div>
      ) : (
        <>
          {searchable && (
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className="mb-2 w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[13px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {searchable && visibles.length === 0 && <p className="text-[12px] text-[#5A6B7A]">Sin resultados.</p>}
            {ordenados.map((option) => renderChip(option))}
          </div>
        </>
      )}

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-[11px] font-medium text-[#1A7A5E]"
        >
          {expanded ? 'Listo' : value.length > 0 ? `Modificar (${value.length})` : `Elegir (${options.length})`}
        </button>
      )}

      {allowCustom && (!collapsible || expanded) && (
        <div className="mt-2 flex gap-2">
          <input
            value={nuevoValor}
            onChange={(e) => setNuevoValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarCustom();
              }
            }}
            disabled={disabled}
            placeholder="Agregar nueva…"
            className="flex-1 rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[13px] text-[#0A1628] outline-none focus:border-[#1A7A5E] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={agregarCustom}
            disabled={disabled}
            className="shrink-0 rounded-[10px] border border-[#0A1628] px-3 py-2 text-[12px] font-medium text-[#0A1628] disabled:opacity-50"
          >
            + Agregar
          </button>
        </div>
      )}
    </div>
  );
}
