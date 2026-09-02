# CLAUDE.md — App Médico MUVET

## Identidad

MUVET es una plataforma colombiana de telemedicina veterinaria. Este repositorio
es la **App Médico**: la herramienta de trabajo del médico veterinario en campo,
que gestiona el flujo completo de consulta domiciliaria (de la solicitud al
cierre con historia clínica) y se conecta a **MUVET Turnos** (bolsa gremial) y
**MUVET Relevo** (médico↔médico).

- **MVP:** v1.2 · 18 pantallas
- **Registro clínico:** 100% manual
- **Plan:** un solo plan, **GARRA**, gratuito. Sin pagos.
- **Sin GPS. Sin IA.**
- **Formato:** PWA mobile-first, viewport de diseño ~390px.

**Stack confirmado:** React 18 + Vite + JavaScript (JSX) + Tailwind CSS +
supabase-js + react-router-dom. Backend: Supabase (Auth + Postgres + Storage +
RLS). Deploy: Vercel. Versionado: GitHub.

**Actores (3):**
- **Médico Veterinario** → flujo clínico completo + Turnos + Relevo
- **Auxiliar Veterinario** → solo Turnos + Home simplificado
- **Clínica Veterinaria** → solo Turnos + Perfil clínica

---

## Reglas de negocio INAMOVIBLES

Violar cualquiera de estas reglas invalida el trabajo entregado.

- **D-043** — El SOAP es **ABSOLUTAMENTE** inaccesible para el tutor. Ninguna
  tabla, endpoint, componente o hint debe permitir ni sugerir que el tutor lo
  vea. El control se aplica a nivel de RLS.
- **D-064** — La dirección exacta del tutor **NUNCA** es visible antes de que
  el médico confirme la asistencia. En N-3 solo se muestra zona/barrio; la
  dirección se revela en N-4 (post-aceptación). El control es de backend
  (RLS/vista), no solo de UI.
- **D-116** — Doble consentimiento obligatorio (tutor acepta en su app + médico
  confirma en la suya). Sin ambos, la Constelación no abre. Es una transacción
  de dos pasos con estado persistido en BD.
- **D-537** — El timestamp del check-in de llegada es **inmutable** en BD. Solo
  fecha/hora, sin GPS.
- **D-536** — N-4 sin GPS ni mapa interno. Única navegación permitida: deep
  link a la app de mapas nativa del dispositivo.
- **D-541** — Sin matrícula COMVEZCOL validada el médico **no puede** activar
  disponibilidad. La validación se automatiza contra el registro público del
  Consejo (Edge Function `verificar-comvezcol`) y solo se aprueba sola ante
  coincidencia inequívoca: matrícula numérica, **una** fila, matrícula
  confirmada en la página de detalle y nombre concordante. La automatización
  **nunca** escribe `rechazado`: rechazar es siempre una decisión humana.
  `estado_validacion` y `fecha_validacion` solo los escribe el service role
  (trigger `fn_proteger_estado_validacion`); el cliente no puede auto-validarse
  ni activar `disponible` sin estar validado. Tres desenlaces:
  - `validado` — puede activar DISPONIBLE.
  - **`en_disputa`** — posible suplantación: la matrícula ya está en otra
    cuenta de MUVET, o existe en el Consejo a nombre de otra persona. Queda
    **bloqueado**: solo puede actualizar su perfil y escribir a soporte
    (`/soporte`). El bloqueo es de backend (RLS + `perfil_en_disputa()`), no
    solo de UI. Solo una persona lo saca de ahí.
  - `pendiente` — no se pudo verificar por cualquier otra razón. Usa la app
    con normalidad mientras se valida **a mano, con plazo ≤24h** (pero sigue
    sin poder activar DISPONIBLE).

  *Modificación al D-541 original ("validación manual") confirmada con el
  fundador — ver `supabase/migrations/0024` y `0025`.*
- **Revisión manual de matrículas** — la bandeja es la vista
  `revision_matriculas_pendientes` (Supabase Dashboard → SQL Editor). No es
  legible por los usuarios de la app. Aviso opcional por correo si se
  configuran los secrets `RESEND_API_KEY` y `SOPORTE_EMAIL`.
- **D-550** — El toggle DISPONIBLE queda bloqueado hasta que el médico
  configure al menos un servicio con precio > 0 en N-27.
- **D-539** — Sustancias controladas → aviso al médico (Resolución 1478/2006
  de Colombia), **sin bloqueo**.
- **D-540** — La bolsa gremial (N-26, ruta `/relevo`, tablas `relevo_*` — de
  cara al usuario **MUVET Turnos**; ver `src/lib/nombresModulos.js`) se negocia
  en una **conversación 1:1 privada** entre las dos partes de una postulación
  (`relevo_conversaciones` + los mensajes de `relevo_mensajes.conversacion_id`),
  que vive **solo mientras dura la negociación**: al aceptarse o descartarse, el
  hilo se cierra a mensajes nuevos. Sin adjuntos y sin tiempo real. El turno se
  cierra únicamente con el **acuerdo de ambas partes** (`acuerdo_autor` +
  `acuerdo_interesado`); `estado` lo deriva un trigger en BD, nunca el cliente.
  Los datos de contacto directo (teléfono, dirección de sede) solo se revelan
  una vez la conversación queda `aceptada` — mismo criterio que D-064.

  *Modificación al D-540 original ("mensaje único de contacto, sin chat en
  tiempo real, sin hilo de conversación") confirmada con el fundador — ver
  `supabase/migrations/0027`. La excepción del módulo médico↔médico (N-30,
  `cobertura_*`, hoy **MUVET Relevo** en la UI — `0023`, chat en tiempo real con
  adjuntos) sigue siendo aparte y más amplia.*
- **Cierre de MUVET Relevo** (sin número de decisión asignado todavía —
  pedido del fundador, implementado en `supabase/migrations/0034`) — **MUVET
  Relevo (N-30, `cobertura_*`)** cierra igual que los otros dos módulos
  gremiales: con el **acuerdo de ambas partes**. Ofrecerse solo abre
  la negociación (`estado = 'propuesta'`); el servicio queda tomado
  (`'cubierta'`) cuando están las dos banderas `acuerdo_autor` +
  `acuerdo_cobertura`, y `estado` lo deriva el backend, nunca el cliente.
  Descartar **no** es terminal acá —la solicitud tiene un solo cupo y vuelve al
  tablón—, y al descartar se borran los mensajes de esa negociación. Dos reglas
  propias de este módulo:
  - **Sin control de pagos.** El médico que releva le cobra directamente al
    tutor, así que no hay pago entre las dos partes que marcar ni datos
    bancarios que intercambiar. Los RPC `cobertura_pago_*` no existen.
  - **El chat sobrevive 24 h a la finalización** —se puede leer y escribir— y
    después se cierra y se purga. "Sin historial del chat" (`0023`) sigue
    vigente: la retención pasa de 0 h a 24 h, no a perpetua. El corte lo impone
    la RLS (`cobertura_chat_abierto`), no la UI.
- **D-552** — N-8 incluye logo/firma del médico (PNG/JPG ≤2MB) que se estampa
  en Fórmula (N-12) y Recomendaciones (N-18). Si no hay imagen: placeholder de
  iniciales + nombre + matrícula.
- **D-014** — No exponer el logo gráfico de MUVET hasta el registro de marca.
  Usar solo wordmark tipográfico ("MUVET").
- El timer de 60s para aceptar/rechazar una solicitud se valida en **backend**,
  nunca solo en frontend.
- El SOAP siempre usa la notación **S/O/A/P** (nunca S/O/T/P ni otra variante).

---

## Glosario anti-alucinación

Nomenclatura canónica. Prohibido inventar términos alternativos.

- **Plan del médico en el MVP:** GARRA (único). Tiers futuros (no implementar):
  HALCÓN · CÓNDOR · COLMENA. **No existen** "NÓMADA", "MENSAJERO", "GUARDIÁN".
- **IA:** IRIS (motor clínico) y NanIA (asistente del tutor). **No entran en
  el MVP.** No existen ZamenIA, Hermes, Hugin, HygeIA como sistemas de este
  producto.
- **Pasarela de pagos futura:** Siigo Pay (nunca Wompi). No entra en el MVP.
- **⚠️ Los CUATRO módulos gremiales — nombres visibles ≠ identificadores.** En
  los tres primeros los nombres se intercambiaron o quedaron ocupados y el
  código NO se renombró. Antes de escribir una línea sobre cualquiera de ellos,
  leer `src/lib/nombresModulos.js`:

  | UI | Pantalla | Ruta | Lib / tablas |
  |---|---|---|---|
  | **MUVET Turnos** — bolsa gremial multi-rol | N-26 | `/relevo` | `lib/relevo.js`, `relevo_*` |
  | **MUVET Relevo** — médico↔médico, pasar un servicio | N-30 | `/cobertura-servicio` | `lib/coberturaServicio.js`, `cobertura_*` |
  | **MUVET Auxiliar** — médico↔auxiliar | N-32 | `/apoyo` | `lib/apoyo.js`, `apoyo_*` |
  | **MUVET Especialistas** — directorio + tablón | N-35 | `/especialistas` | `lib/especialistas.js`, `especialista_*` |

  Un chip etiquetado "Relevo" cuyo `value` es `'cobertura'` **es correcto**.
  Nombres anteriores, ya retirados de la UI: "MUVET Relevo" para N-26 y
  "Cobertura de Servicio" para N-30.

  ✅ **MUVET Especialistas es la excepción**: es el único de los cuatro cuyo
  identificador interno coincide con su nombre visible. Nació con su nombre
  definitivo, así que no hay discordancia que recordar.

  ⚠️ En N-32 el identificador es `apoyo` y **no** `auxiliar`, porque `auxiliar`
  ya es un valor de `perfiles.rol`. Son tres cosas distintas: `apoyo` (el
  módulo), "MUVET Auxiliar" (su nombre visible) y `'auxiliar'` (el rol).
- **Especialidades vs. especialidad.** `perfiles.especialidades` (plural,
  `text[]`, migración 0039) es el catálogo cerrado de
  `src/lib/especialidades.js` que alimenta el directorio de N-35.
  `perfiles.especialidad` (singular, texto libre, 0001) es el campo viejo, sigue
  vivo y lo leen las fichas de N-26 y N-32. No se migró uno al otro.
- **"Constelación"** = interfaz durante la consulta activa (pantalla N-4).
- **"Barra Trueta"** = barra de navegación persistente de la Constelación. Es
  un **componente**, no una pantalla independiente.
- **"Tutor"** = dueño de la mascota. Nunca usar "propietario" en la UI.


---

## No incluir en el MVP

Ninguna referencia en UI ni en código a:

IRIS / ZamenIA / STT · gamificación (Latidos, MuBits, Aura, XP, misiones,
Gachapón) · billetera Marsupio · pagos y planes de pago · GPS/mapas en tiempo
real · teleconsulta · OCR · chat en tiempo real · escalamiento al Comité
Médico · órdenes a red aliada MUVET.

---

## Convenciones de trabajo

- Mobile-first ~390px, diseño para uso a una mano: CTAs principales en el
  tercio inferior de la pantalla. Tipografía clínica mínima 14px.
- Todo dato falso se marca `// MOCK` y vive exclusivamente en `/src/mocks`.
  Nunca presentar un dato mock como si fuera real.
- Nada de librerías nuevas sin autorización explícita del fundador.
- Ante ambigüedad: **no decidir en silencio**. Dejar `// SUPUESTO: ...` en el
  código y reportarlo al final de la sesión.
- Trabajo incremental: una fase validada antes de iniciar la siguiente. No
  tocar módulos fuera del alcance del prompt activo.

---

## Sistema de diseño (tokens)

**Tono:** clínico, eficiente, confiable. Instrumento médico, no consumer.

| Uso | Color |
|---|---|
| Primario | Azul marino profundo `#0A1628` |
| Secundario | Verde esmeralda clínico `#1A7A5E` |
| Acentos | Cian frío / blanco puro |
| Fondo | Blanco / gris muy frío |
| Alerta | Ámbar |
| Crítico | Rojo clínico |
| OK | Esmeralda |
| Info | Cian suave |

Variables CSS en `src/styles/tokens.css`.
