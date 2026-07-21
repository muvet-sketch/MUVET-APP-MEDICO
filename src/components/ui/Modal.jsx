export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[430px] rounded-t-[16px] bg-white p-5 sm:rounded-[16px]">
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-[16px] font-semibold text-[#0A1628]">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] text-[#5A6B7A]"
            aria-label="Cerrar"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
