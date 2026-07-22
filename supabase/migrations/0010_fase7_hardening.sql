-- ============================================================================
-- MUVET · App Médico — Migración 0010: Fase 7 — hardening RLS + storage
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- Aplicada también vía MCP contra el proyecto real (APP_MEDICO,
-- hwfhzvpfwzejhqxprsfz). Todas las tablas afectadas tenían 0 filas al momento
-- de aplicar esta migración (verificado con list_tables) — no hay datos reales
-- que puedan quedar huérfanos por el endurecimiento de políticas.
--
-- Resuelve los TODOs de Fase 7 dejados en 0001 (líneas 91-96, 395-407),
-- 0004 (líneas 299-303) y 0005 (líneas 41-43), y el advisor
-- `function_search_path_mutable` sobre las 3 funciones trigger que no
-- tenían `search_path` fijo.
-- ============================================================================

-- ============================================================================
-- 1. tutores / mascotas: de "cualquier autenticado ve todo" a "visible si hay
--    relación (servicio propio) o si la solicitud asociada sigue
--    pendiente/expirada" (mismo criterio ya usado en
--    "solicitudes_select_pendientes_o_propias" de 0004).
--
--    IMPORTANTE: `solicitudes_pre_aceptacion` (0001) tiene
--    security_invoker = true desde 0007 — es decir, para que N-3 siga
--    mostrando especie/raza/nombre de mascota y primer nombre del tutor de
--    una solicitud pendiente ANTES de que el médico la acepte, la política de
--    mascotas/tutores tiene que seguir permitiendo esa lectura mientras la
--    solicitud esté 'pendiente' o 'expirada' — igual que ya permite
--    `solicitudes` misma. Restringir solo a "servicio propio" rompería la
--    vista de pre-aceptación (LEFT JOIN devolvería NULL en esas columnas).
-- ============================================================================
drop policy if exists "mascotas_select_authenticated" on mascotas;
create policy "mascotas_select_relacion_o_pendiente" on mascotas
  for select using (
    exists (select 1 from servicios s where s.mascota_id = mascotas.id and s.medico_id = auth.uid())
    or exists (select 1 from solicitudes s where s.mascota_id = mascotas.id and s.estado in ('pendiente', 'expirada'))
  );

drop policy if exists "tutores_select_authenticated" on tutores;
create policy "tutores_select_relacion_o_pendiente" on tutores
  for select using (
    exists (
      select 1 from mascotas m join servicios s on s.mascota_id = m.id
      where m.tutor_id = tutores.id and s.medico_id = auth.uid()
    )
    or exists (select 1 from solicitudes s where s.tutor_id = tutores.id and s.estado in ('pendiente', 'expirada'))
  );

-- ============================================================================
-- 2. vacunas / desparasitaciones / seguimientos: sin exposición pre-
--    aceptación (no aparecen en solicitudes_pre_aceptacion), se pueden
--    restringir de forma estricta a "el médico tiene/tuvo un servicio para
--    esta mascota".
-- ============================================================================
drop policy if exists "vacunas_select_authenticated" on vacunas;
create policy "vacunas_select_medico_con_servicio" on vacunas
  for select using (
    exists (select 1 from servicios s where s.mascota_id = vacunas.mascota_id and s.medico_id = auth.uid())
  );

drop policy if exists "desparasitaciones_select_authenticated" on desparasitaciones;
create policy "desparasitaciones_select_medico_con_servicio" on desparasitaciones
  for select using (
    exists (select 1 from servicios s where s.mascota_id = desparasitaciones.mascota_id and s.medico_id = auth.uid())
  );

drop policy if exists "seguimientos_select_authenticated" on seguimientos;
create policy "seguimientos_select_medico_con_servicio" on seguimientos
  for select using (
    exists (select 1 from servicios s where s.mascota_id = seguimientos.mascota_id and s.medico_id = auth.uid())
  );

-- ============================================================================
-- 3. medicamentos_actuales / alergias: cierra el TODO de 0005 — agrega
--    insert/update restringidos al médico dentro de un servicio activo sobre
--    esa mascota (la Constelación ya solo permite registrar mientras el
--    servicio está 'activa').
-- ============================================================================
create policy "medicamentos_actuales_write_medico_servicio_activo" on medicamentos_actuales
  for insert with check (
    exists (
      select 1 from servicios s
      where s.mascota_id = medicamentos_actuales.mascota_id and s.medico_id = auth.uid() and s.estado = 'activa'
    )
  );
create policy "medicamentos_actuales_update_medico_servicio_activo" on medicamentos_actuales
  for update using (
    exists (
      select 1 from servicios s
      where s.mascota_id = medicamentos_actuales.mascota_id and s.medico_id = auth.uid() and s.estado = 'activa'
    )
  );

create policy "alergias_write_medico_servicio_activo" on alergias
  for insert with check (
    exists (
      select 1 from servicios s
      where s.mascota_id = alergias.mascota_id and s.medico_id = auth.uid() and s.estado = 'activa'
    )
  );
create policy "alergias_update_medico_servicio_activo" on alergias
  for update using (
    exists (
      select 1 from servicios s
      where s.mascota_id = alergias.mascota_id and s.medico_id = auth.uid() and s.estado = 'activa'
    )
  );

-- ============================================================================
-- 4. solicitudes: TODO de 0004 (líneas 299-303) — CERRADO SIN CAMBIO DE
--    CÓDIGO, se documenta por escrito por qué (revisión: 2026-07-21).
--
--    "solicitudes_select_pendientes_o_propias" se queda como está. Filtrar
--    por zona real (comparando zona_aproximada de texto libre contra
--    perfiles.zona_cobertura) no tiene una regla de matching definida en
--    ningún despacho, y estrechar esta política sin esa regla arriesga con
--    romper la detección por Realtime documentada en la nota "SUPUESTO —
--    diseño de solicitudes_direccion" de 0004 (postgres_changes evalúa RLS
--    de SELECT sobre la tabla base por cada evento; cualquier política más
--    estricta que excluya alguna fila 'pendiente' para un médico disponible
--    le oculta el INSERT en tiempo real, no solo la lectura posterior). La
--    única información expuesta hoy en ese estado es la ya deliberadamente
--    recortada por `solicitudes_pre_aceptacion` (sin dirección exacta, sin
--    datos del tutor más allá del primer nombre) — no hay dato sensible
--    adicional que este TODO estuviera dejando expuesto. Revisar de nuevo
--    si se define una regla de matching por zona en un despacho futuro.
-- ============================================================================

-- ============================================================================
-- 5. search_path fijo en las 3 funciones trigger que no lo tenían
--    (advisor function_search_path_mutable).
-- ============================================================================
create or replace function fn_bloquear_update_checkin_llegada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.checkin_llegada_at is not null and new.checkin_llegada_at is distinct from old.checkin_llegada_at then
    raise exception 'checkin_llegada_at es inmutable una vez registrado (D-537)';
  end if;
  return new;
end;
$$;

create or replace function fn_set_expira_en_solicitud()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is null then
    new.estado := 'pendiente';
  end if;
  if new.expira_en is null then
    new.expira_en := new.created_at + interval '60 seconds';
  end if;
  return new;
end;
$$;

create or replace function fn_bloquear_update_soap_post_cierre()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from servicios s where s.id = old.servicio_id and s.estado = 'cerrada'
  ) then
    raise exception 'El SOAP es inmutable una vez cerrado el servicio (D-507). Usa el flujo de corrección post-cierre.';
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 6. Acción 8 del despacho de Fase 7 — caveat único y consolidado del
--    "médico actuando como proxy del tutor" mientras no exista auth real de
--    la App Tutor. Antes vivía duplicado/disperso: comentario largo junto a
--    registrar_respuesta_tutor (0006), comentario corto junto a
--    simular_calificacion_tutor (0009 — "mismo patrón/caveat que..."), y
--    ecos en src/lib/apertura.js y src/lib/historial.js. Este bloque es
--    ahora la referencia canónica; los demás apuntan aquí en vez de repetir
--    la explicación completa.
--
--    Alcance del caveat (todo temporal, hasta que exista auth real de App
--    Tutor — un usuario autenticado con su propia identidad, no un médico
--    actuando en su nombre):
--      - registrar_respuesta_tutor(p_servicio_id, p_aceptado)   [0006] — acotada a medico_id = auth.uid() del servicio.
--      - simular_calificacion_tutor(...)                        [0009] — misma acotación, además solo invocable desde el panel dev-only de N-9.
--      - solicitudes_insert_authenticated                       [0004] — cualquier authenticated puede insertar (hoy: solo el simulador dev).
--      - solicitudes_direccion_insert_authenticated              [0004] — idem.
--      - tutores_insert_authenticated                            [0004] — idem.
--      - mascotas_insert_authenticated                           [0004] — idem.
--    Ninguna de estas políticas de INSERT valida identidad del tutor porque
--    esa identidad no existe todavía en el sistema. El riesgo (cualquier
--    usuario autenticado de la App Médico podría crear solicitudes/tutores/
--    mascotas falsos) se acepta explícitamente para el MVP porque: (a) solo
--    médicos ya validados por COMVEZCOL o en proceso de validación tienen
--    cuentas autenticadas en este sistema, (b) no hay superficie de daño a
--    terceros — las filas creadas son visibles solo a quien las creó o a
--    quien acepte la solicitud resultante. Cuando exista la App Tutor real,
--    estas 6 políticas/funciones deben migrar a validar la identidad real
--    del tutor autenticado, no la de un authenticated genérico ni la del
--    médico. TODO único: P-EI-AppMedico-TUTOR-AUTH.
--
--    Advisor (get_advisors security, revisión 2026-07-21): las 4 políticas de
--    INSERT listadas arriba disparan `rls_policy_always_true`
--    (mascotas_insert_authenticated, solicitudes_insert_authenticated,
--    solicitudes_direccion_insert_authenticated, tutores_insert_authenticated)
--    — quedan CONFIRMADAS Y JUSTIFICADAS por escrito aquí mismo, no corregidas
--    en esta fase, por las razones (a)/(b) de arriba.
-- ============================================================================

-- ============================================================================
-- 8. Advisor anon_security_definer_function_executable: las 23 funciones
--    SECURITY DEFINER de 0004/0006/0008/0009/0010 quedaban ejecutables por el
--    rol `anon` (sin autenticación) vía /rest/v1/rpc/..., porque Postgres
--    otorga EXECUTE a PUBLIC por defecto y ninguna migración anterior lo
--    revocó explícitamente. La mayoría ya se protege internamente
--    comparando `medico_id = auth.uid()` (auth.uid() es NULL para `anon`,
--    así que la condición nunca es verdadera y la función no-opea/lanza
--    "no encontrado") — pero exponerlas a `anon` es innecesario en esta app
--    (todo lo posterior al login requiere sesión) y es defensa en profundidad
--    barata revocar el EXECUTE de `anon` explícitamente en vez de confiar
--    solo en la lógica interna. El advisor
--    `authenticated_security_definer_function_executable` sobre estas mismas
--    funciones para el rol `authenticated` SÍ es el comportamiento esperado
--    (los médicos autenticados son quienes deben poder llamarlas) y se deja
--    tal cual.
--
--    CORRECCIÓN aplicada en el mismo despacho: `revoke ... from anon` no
--    tiene efecto por sí solo porque Postgres otorga EXECUTE a estas
--    funciones al pseudo-rol PUBLIC por defecto al crearlas (comportamiento
--    de `create function` sin cláusula de privilegios explícita), y PUBLIC
--    aplica a todo rol — incluido anon — independientemente de sus propios
--    grants. Hay que revocar de PUBLIC y volver a otorgar explícitamente a
--    authenticated (service_role/postgres ya tienen grants propios, no via
--    PUBLIC, así que no se ven afectados).
-- ============================================================================
revoke execute on function abrir_constelacion(uuid) from public;
revoke execute on function aceptar_solicitud(uuid) from public;
revoke execute on function actualizar_estado_formula(uuid, text) from public;
revoke execute on function actualizar_items_orden(uuid, text, jsonb, text) from public;
revoke execute on function agregar_formula_item(uuid, text, text, text, text, text, text, boolean) from public;
revoke execute on function aprobar_recomendaciones(uuid) from public;
revoke execute on function cancelar_servicio(uuid) from public;
revoke execute on function cargar_resultado_orden(uuid, text, jsonb, text) from public;
revoke execute on function cerrar_servicio(uuid) from public;
revoke execute on function crear_orden_externa(uuid, text, jsonb, text) from public;
revoke execute on function eliminar_formula_item(uuid) from public;
revoke execute on function emitir_orden_externa(uuid) from public;
revoke execute on function expirar_solicitudes_vencidas() from public;
revoke execute on function guardar_recomendaciones(uuid, text, text, text, text) from public;
revoke execute on function guardar_soap_nota(uuid, text, jsonb, jsonb, text) from public;
revoke execute on function obtener_o_crear_formula(uuid) from public;
revoke execute on function rechazar_solicitud(uuid) from public;
revoke execute on function registrar_checkin_llegada(uuid) from public;
revoke execute on function registrar_consentimiento_medico(uuid, boolean) from public;
revoke execute on function registrar_respuesta_tutor(uuid, boolean) from public;
revoke execute on function reintentar_consentimiento_tutor(uuid) from public;
revoke execute on function simular_calificacion_tutor(uuid, integer, text) from public;
revoke execute on function solicitar_correccion_soap(uuid, text, text, text) from public;

grant execute on function abrir_constelacion(uuid) to authenticated;
grant execute on function aceptar_solicitud(uuid) to authenticated;
grant execute on function actualizar_estado_formula(uuid, text) to authenticated;
grant execute on function actualizar_items_orden(uuid, text, jsonb, text) to authenticated;
grant execute on function agregar_formula_item(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function aprobar_recomendaciones(uuid) to authenticated;
grant execute on function cancelar_servicio(uuid) to authenticated;
grant execute on function cargar_resultado_orden(uuid, text, jsonb, text) to authenticated;
grant execute on function cerrar_servicio(uuid) to authenticated;
grant execute on function crear_orden_externa(uuid, text, jsonb, text) to authenticated;
grant execute on function eliminar_formula_item(uuid) to authenticated;
grant execute on function emitir_orden_externa(uuid) to authenticated;
grant execute on function expirar_solicitudes_vencidas() to authenticated;
grant execute on function guardar_recomendaciones(uuid, text, text, text, text) to authenticated;
grant execute on function guardar_soap_nota(uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function obtener_o_crear_formula(uuid) to authenticated;
grant execute on function rechazar_solicitud(uuid) to authenticated;
grant execute on function registrar_checkin_llegada(uuid) to authenticated;
grant execute on function registrar_consentimiento_medico(uuid, boolean) to authenticated;
grant execute on function registrar_respuesta_tutor(uuid, boolean) to authenticated;
grant execute on function reintentar_consentimiento_tutor(uuid) to authenticated;
grant execute on function simular_calificacion_tutor(uuid, integer, text) to authenticated;
grant execute on function solicitar_correccion_soap(uuid, text, text, text) to authenticated;

-- ============================================================================
-- 9. Storage bucket 'documents': de público a privado (Acción 9). Las
--    policies de storage.objects para insert/update/delete (0003) ya estaban
--    correctamente scoped a la carpeta del propio usuario
--    ((storage.foldername(name))[1] = auth.uid()::text) — el único cambio es
--    reemplazar el SELECT público por uno scoped igual. El acceso pasa a
--    resolverse con signed URLs generadas en el momento de uso (ver
--    src/lib/storage.js, Acción 9 del resumen de cierre) en vez de
--    getPublicUrl(). Sin filas reales en `perfiles`/`ordenes_externas` con
--    URLs públicas ya guardadas — no hay URLs rotas que reparar.
-- ============================================================================
update storage.buckets set public = false where id = 'documents';

drop policy if exists "documents_select_public" on storage.objects;
create policy "documents_select_own_folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 10. Acción 10 del despacho de Fase 7 — notificaciones push reales
--    (FCM/OneSignal). SUPUESTO — requiere credenciales de FCM/OneSignal, no
--    disponibles en `.env`/`.env.example` de este entorno (verificado:
--    ningún VITE_FCM_*/VITE_ONESIGNAL_*/VITE_VAPID_* configurado). No
--    implementado. `notificaciones_pendientes` (0009, líneas 62-79) sigue
--    registrando el evento sin enviarlo, como ya documentaba su comentario
--    original ("Fase 7" era la referencia futura, hoy resuelta como
--    pendiente de credenciales, no de trabajo). No bloquea el resto de esta
--    fase, según lo autoriza el despacho. Ver P-EI-AppMedico-PUSH.
-- ============================================================================
