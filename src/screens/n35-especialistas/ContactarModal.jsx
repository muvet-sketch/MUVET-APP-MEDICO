import { useState } from 'react';
import { Modal, Button } from '../../components/ui';

// Modal de primer contacto, compartido por las dos mitades del módulo: la ficha
// del directorio y la tarjeta de una oferta del tablón. Lo único que cambia
// entre ambas es el título y quién es el destinatario, así que se recibe
// `onEnviar` ya resuelto.
//
// El primer mensaje NO es opcional: `iniciarConversacion*` lo exige. Una
// conversación vacía no le dice nada al otro y ensucia su bandeja.
export default function ContactarModal({ open, onClose, titulo, ayuda, placeholder, onEnviar }) {
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  function cerrar() {
    if (enviando) return;
    setMensaje('');
    setError('');
    onClose();
  }

  async function handleEnviar() {
    const texto = mensaje.trim();
    if (!texto) {
      setError('Escribe un mensaje para iniciar la conversación.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await onEnviar(texto);
      setMensaje('');
    } catch (err) {
      setError(err.message ?? 'No se pudo iniciar la conversación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title={titulo}>
      <div className="flex flex-col gap-3">
        {ayuda && <p className="text-[12px] text-[#5A6B7A]">{ayuda}</p>}

        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={4}
          placeholder={placeholder ?? 'Cuéntale qué necesitas…'}
          className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
        />

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button onClick={handleEnviar} disabled={enviando || !mensaje.trim()}>
          {enviando ? 'Enviando…' : 'Enviar y abrir conversación'}
        </Button>
        <Button variant="ghost" onClick={cerrar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
