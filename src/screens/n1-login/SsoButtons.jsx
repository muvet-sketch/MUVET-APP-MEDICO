// TODO Fase posterior — SSO real con Google/Apple. Por ahora solo visible, deshabilitado.
export default function SsoButtons() {
  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] px-4 py-3 text-[14px] text-[#5A6B7A]"
      >
        Continuar con Google · Próximamente
      </button>
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] px-4 py-3 text-[14px] text-[#5A6B7A]"
      >
        Continuar con Apple · Próximamente
      </button>
    </div>
  );
}
