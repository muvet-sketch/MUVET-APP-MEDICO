import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { routeForRol } from '../../lib/auth';
import { validateImageFile } from '../../lib/fileValidation';
import { crearSugerencia } from '../../lib/mejoras';
import { Card, Button, Toast, ScreenHeader } from '../../components/ui';

// N-33 · "Ayúdanos a Mejorar" (migración 0036). Abierta a los 3 actores: se
// llega por el menú hamburguesa, que viaja en las dos Home y en todo
// ScreenHeader con campana.
//
// Es solo-enviar a propósito: el feedback lo lee el fundador por el Dashboard,
// no se responde dentro de la app, así que listar lo ya enviado solo prometería
// una conversación que no existe. Al enviar se limpia el formulario y confirma
// un Toast.
const MAX_IMAGENES = 4;
const MAX_MB = 5;

export default function N33Mejoras() {
  const { perfil } = useAuth();

  const [texto, setTexto] = useState('');
  // [{ id, file, previewUrl }] — previewUrl es un object URL que hay que
  // revocar a mano al quitar la imagen, al enviar y al desmontar.
  const [imagenes, setImagenes] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  // El cleanup de desmontaje necesita la lista viva, pero no queremos que el
  // efecto se vuelva a montar (y revoque los blobs en uso) en cada cambio.
  const imagenesRef = useRef(imagenes);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(
    () => () => {
      imagenesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    },
    [],
  );

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  function handleAddFiles(e) {
    setError('');
    const nuevos = Array.from(e.target.files ?? []);
    // Permite volver a elegir el mismo archivo después de quitarlo.
    e.target.value = '';
    if (nuevos.length === 0) return;

    setImagenes((prev) => {
      const espacio = MAX_IMAGENES - prev.length;
      if (espacio <= 0) {
        setError(`Máximo ${MAX_IMAGENES} imágenes.`);
        return prev;
      }

      const aceptadas = [];
      for (const file of nuevos.slice(0, espacio)) {
        const { ok, error: errorValidacion } = validateImageFile(file, MAX_MB);
        if (!ok) {
          setError(errorValidacion);
          continue;
        }
        aceptadas.push({
          id: `${file.name}-${file.size}-${Date.now()}-${aceptadas.length}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (nuevos.length > espacio) setError(`Máximo ${MAX_IMAGENES} imágenes.`);
      return [...prev, ...aceptadas];
    });
  }

  function handleRemoveImagen(id) {
    setImagenes((prev) => {
      const objetivo = prev.find((img) => img.id === id);
      if (objetivo) URL.revokeObjectURL(objetivo.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!texto.trim()) {
      setError('Escribe tu recomendación.');
      return;
    }

    setEnviando(true);
    try {
      await crearSugerencia({
        perfilId: perfil.id,
        texto: texto.trim(),
        imagenes: imagenes.map((img) => img.file),
      });
      imagenes.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImagenes([]);
      setTexto('');
      showToast('¡Gracias! Recibimos tu recomendación.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar tu recomendación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#F7F9FB]">
      <ScreenHeader title="Ayúdanos a Mejorar" fallbackTo={routeForRol(perfil?.rol)} conCampana />

      <div className="flex flex-col gap-4 px-5 py-5">
        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">¿Qué mejorarías de MUVET?</p>
          <p className="text-[12px] leading-relaxed text-[#5A6B7A]">
            Leemos todo lo que nos escriben. No respondemos por acá, pero nos sirve para decidir qué
            construir primero.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="w-full text-left">
              <label htmlFor="texto-mejora" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
                Tu recomendación
              </label>
              <textarea
                id="texto-mejora"
                rows={5}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Cuéntanos qué te gustaría que cambiara o funcionara mejor."
                className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
              />
            </div>

            {imagenes.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {imagenes.map((img) => (
                  <div
                    key={img.id}
                    className="relative aspect-square overflow-hidden rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9]"
                  >
                    <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImagen(img.id)}
                      aria-label="Quitar imagen"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#0A1628]/70 text-[12px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imagenes.length < MAX_IMAGENES && (
              <label className="w-full">
                <span className="block w-full cursor-pointer rounded-[10px] border border-[#0A1628] bg-transparent px-4 py-3 text-center text-[14px] font-medium text-[#0A1628]">
                  📷 Añadir imágenes ({imagenes.length}/{MAX_IMAGENES})
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  onChange={handleAddFiles}
                  className="hidden"
                />
              </label>
            )}

            <p className="text-[12px] text-[#5A6B7A]">
              Opcional: hasta {MAX_IMAGENES} imágenes (PNG o JPG, máximo {MAX_MB}MB cada una).
            </p>

            {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

            <Button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar recomendación'}
            </Button>
          </form>
        </Card>
      </div>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
