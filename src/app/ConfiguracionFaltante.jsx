import Card from '../components/ui/Card';

// Pantalla de último recurso: se muestra en vez de la app cuando el bundle se
// construyó sin las variables de entorno de Supabase (ver src/lib/supabase.js).
// Existe para que ese fallo de despliegue sea legible en el dispositivo, en vez
// de un documento en blanco que obliga a abrir la consola para diagnosticar.
//
// Import directo de Card (no del barril de components/ui) a propósito: esta
// pantalla tiene que poder renderizar aunque el resto de la app esté rota, así
// que arrastra las mínimas dependencias posibles.
export default function ConfiguracionFaltante() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[430px] flex-col justify-center gap-4 bg-[#F7F9FB] px-5 py-8 text-[14px] text-[#0A1628]">
      <p className="text-[20px] font-semibold tracking-tight">MUVET</p>

      <Card className="flex flex-col gap-3 border-l-4 border-l-[#E8A23D]">
        <p className="text-[16px] font-semibold">La app no pudo iniciar</p>
        <p className="leading-relaxed text-[#5A6B7A]">
          Falta la configuración de conexión con el servidor, así que no es posible cargar la
          aplicación. No es un problema de tu dispositivo ni de tu conexión.
        </p>
        <p className="text-[12px] leading-relaxed text-[#5A6B7A]">
          Si administras este despliegue: define <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> en las variables de entorno del proyecto y vuelve a
          construir. Estas variables se incrustan durante el build, así que un redeploy sin
          reconstruir no las toma.
        </p>
      </Card>
    </div>
  );
}
