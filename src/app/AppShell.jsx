import SimuladorSolicitud from '../dev/SimuladorSolicitud';

export default function AppShell({ children }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[430px] flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[14px] text-[#0A1628]">
      {children}
      {import.meta.env.DEV && <SimuladorSolicitud />}
    </div>
  );
}
