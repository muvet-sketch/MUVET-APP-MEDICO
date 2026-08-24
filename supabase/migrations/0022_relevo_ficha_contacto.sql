-- ============================================================================
-- MUVET · App Médico — Migración 0022: Relevo — ficha de contacto ampliada
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0021.
--
-- Contexto: en "Solicitudes activas" (N-26 · Ofertas), "Ver detalles" sobre un
-- mensaje recibido solo mostraba lo que trae `perfiles_publico` (0014): rol,
-- nombre, razón social. No alcanza para que el dueño de una publicación
-- decida sobre una solicitud — necesita ver los datos de la clínica (NIT,
-- dirección, teléfono) o la ficha profesional de quien se postuló (matrícula
-- COMVEZCOL + su estado de validación, especialidad, zona, bio, teléfono).
-- `perfiles_publico` no puede ampliarse con esas columnas porque es visible
-- para CUALQUIER autenticado (incluso sin ninguna relación); exponer ahí el
-- teléfono o el NIT de todos los perfiles del sistema rompería el diseño
-- deliberado de 0014 ("matrícula, carné, NIT, dirección, teléfono siguen
-- protegidos"; el SUPUESTO de esa migración pedía justo esta función).
--
-- Fix: función SECURITY DEFINER que solo devuelve la ficha ampliada de
-- `perfil_objetivo` si quien pregunta (auth.uid()) y `perfil_objetivo` ya
-- intercambiaron al menos un mensaje de Relevo (como autor de la publicación
-- y remitente, en cualquiera de los dos sentidos) — el mismo universo de
-- "Solicitudes activas" / "Mis postulaciones". No requiere que la
-- postulación esté aceptada: quien recibe una solicitud necesita ver estos
-- datos antes de decidir si acepta o rechaza.
--
-- SUPUESTO: se incluye teléfono en la ficha ampliada tan pronto existe CUALQUIER
-- mensaje entre las partes (no solo tras aceptar). D-540 exige que el contacto
-- sea mediado por un mensaje explícito, y ese mensaje ya existe en este punto
-- del flujo; condicionar además a `estado = 'aceptada'` dejaría a quien recibe
-- la solicitud sin forma de evaluarla antes de decidir. Confirmar con el
-- fundador si el teléfono debe esperar a la aceptación.
-- ============================================================================

create or replace function relevo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  telefono text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text,
  razon_social text,
  nit text,
  direccion_sede text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo, p.telefono, p.bio, p.zona_cobertura,
         p.especialidad, p.matricula_comvezcol, p.estado_validacion,
         p.razon_social, p.nit, p.direccion_sede
  from perfiles p
  where p.id = p_perfil_id
    and exists (
      select 1
      from relevo_mensajes m
      join relevo_publicaciones pub on pub.id = m.publicacion_id
      where (pub.autor_id = auth.uid() and m.remitente_id = p_perfil_id)
         or (m.remitente_id = auth.uid() and pub.autor_id = p_perfil_id)
    );
$$;

grant execute on function relevo_ficha_contacto(uuid) to authenticated;
