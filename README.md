# MUVET · App Médico

App móvil (PWA) para el médico veterinario en campo. MVP v1.2 · 18 pantallas.
Stack: React 18 + Vite + Tailwind CSS + Supabase + react-router-dom.

Ver `CLAUDE.md` para las reglas de negocio inamovibles y el glosario del
producto antes de tocar código.

## 1. Desarrollo local

```bash
npm install
cp .env.example .env   # completar con tus credenciales de Supabase
npm run dev
```

## 2. Crear el proyecto en Supabase y aplicar la migración

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. En **Project Settings → API**, copia `Project URL` y `anon public key` a tu
   `.env` local (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Ve a **SQL Editor → New query**, pega el contenido completo de
   `supabase/migrations/0001_schema_inicial.sql` y ejecútalo. Esto crea todas
   las tablas del MVP, la vista `solicitudes_pre_aceptacion` (D-064), el
   trigger de inmutabilidad de `checkin_llegada_at` (D-537) y las políticas
   base de Row Level Security.
4. En **Authentication → Providers**, confirma si quieres exigir confirmación
   de correo antes de iniciar sesión (afecta el flujo de registro de N-1; el
   código ya contempla ambos casos).
5. En **Storage**, crea manualmente un bucket llamado `documentos` (usado para
   subir el carné COMVEZCOL en el registro de médico, N-1). Configúralo como
   público de lectura o ajusta las políticas de Storage según tu preferencia
   de privacidad — esto queda pendiente de definición fina en fases
   posteriores.
6. Para marcar manualmente un médico como validado durante pruebas: en
   **Table Editor → perfiles**, cambia `estado_validacion` a `validado` en la
   fila correspondiente.

## 3. Conectar el repositorio a GitHub

```bash
git remote add origin git@github.com:muvet-sketch/MUVET-APP-MEDICO.git
git add .
git commit -m "Fase 1: fundaciones del proyecto"
git branch -M main
git push -u origin main
```

## 4. Importar a Vercel

1. En [vercel.com](https://vercel.com), **Add New → Project** e importa el
   repositorio de GitHub.
2. Vercel detecta Vite automáticamente (`vercel.json` ya define
   `buildCommand`, `outputDirectory` y el rewrite SPA a `index.html`).
3. En **Settings → Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Cada push a `main` genera un deploy de producción; cada PR genera
   un preview deploy.

## Estructura del proyecto

```
/src
  /app            App.jsx, router.jsx, AuthContext.jsx, AppShell (layout móvil)
  /screens        una carpeta por pantalla (n1-login, n2-home, ... n29-perfil-clinica)
  /components/ui  Button, Input, Card, Toggle, Badge, Modal, Toast
  /lib            supabase.js (cliente), auth.js (helpers de sesión)
  /styles         tokens.css (paleta), index.css
  /mocks          mockData.js (datos de prueba, marcados // MOCK)
/supabase/migrations   0001_schema_inicial.sql
```

## Estado de esta fase (Fase 1)

Implementado con Supabase real: registro, login, logout, recuperación de
contraseña, selector de actor (N-1), y Home del médico con toggle de
disponibilidad gobernado por D-541 y D-550 (N-2). El resto de pantallas
existen como carpeta + componente placeholder (`// TODO Fase N`).
