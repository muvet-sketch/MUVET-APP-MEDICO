-- ============================================================================
-- MUVET · App Médico — Migración 0008: N-15 SOAP + constantes vitales,
-- N-12 Fórmula médica (estado + RPC) — Fase 5 (Acción 1 y 2)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001-0007.
--
-- Reglas de negocio referenciadas (ver CLAUDE.md):
--   D-043  SOAP absolutamente inaccesible para el tutor — ya reforzado por
--          RLS en 0001 (soap_notas_select_medico_dueno / _write_medico_dueno).
--          Esta migración no agrega columnas ni relaja esas policies.
--   D-539  Sustancias controladas: aviso al médico, sin bloqueo.
--   P3     El médico redacta y aprueba la fórmula; nada se autogenera.
-- ============================================================================

-- ============================================================================
-- formulas: estado BORRADOR / APROBADA / DESCARTADA (Fase 6 lo consumirá
-- para bloquear el cierre del servicio en N-19 — no se implementa ese
-- bloqueo aquí, solo se deja el campo listo).
-- ============================================================================
alter table formulas
  add column if not exists estado text not null default 'borrador'
    check (estado in ('borrador', 'aprobada', 'descartada'));

-- Una fórmula por servicio (upsert-friendly desde el RPC de abajo).
alter table formulas
  add constraint formulas_servicio_id_key unique (servicio_id);

-- Una nota SOAP por servicio (mismo criterio; soap_notas ya vivía 1:1 por
-- convención de uso, esto lo hace explícito para el upsert del RPC).
alter table soap_notas
  add constraint soap_notas_servicio_id_key unique (servicio_id);

-- ============================================================================
-- Funciones (SECURITY DEFINER — mismo patrón que 0004/0006). Todas
-- verifican explícitamente que el servicio pertenezca al médico que llama
-- (auth.uid()), como refuerzo defensivo además de las policies de RLS ya
-- existentes sobre soap_notas / formulas / formula_items.
-- ============================================================================

-- guardar_soap_nota: upsert de la nota SOAP del servicio (N-15). Notación
-- siempre S/O/A/P — o_objetivo guarda constantes vitales + hallazgos +
-- fotos[] (ver comentario de la tabla en 0001); a_assessment guarda
-- dx_principal / diferenciales / estado_problema.
create or replace function guardar_soap_nota(
  p_servicio_id uuid,
  p_s_subjetivo text,
  p_o_objetivo jsonb,
  p_a_assessment jsonb,
  p_p_plan text
)
returns soap_notas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota soap_notas%rowtype;
begin
  if not exists (select 1 from servicios where id = p_servicio_id and medico_id = auth.uid()) then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  insert into soap_notas (servicio_id, s_subjetivo, o_objetivo, a_assessment, p_plan, editado_por, editado_at)
  values (p_servicio_id, p_s_subjetivo, p_o_objetivo, p_a_assessment, p_p_plan, auth.uid(), now())
  on conflict (servicio_id) do update
    set s_subjetivo = excluded.s_subjetivo,
        o_objetivo = excluded.o_objetivo,
        a_assessment = excluded.a_assessment,
        p_plan = excluded.p_plan,
        editado_por = excluded.editado_por,
        editado_at = excluded.editado_at
  returning * into v_nota;

  return v_nota;
end;
$$;

-- obtener_o_crear_formula: asegura una fila `formulas` por servicio (N-12).
create or replace function obtener_o_crear_formula(p_servicio_id uuid)
returns formulas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formula formulas%rowtype;
begin
  if not exists (select 1 from servicios where id = p_servicio_id and medico_id = auth.uid()) then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  select * into v_formula from formulas where servicio_id = p_servicio_id;
  if found then
    return v_formula;
  end if;

  insert into formulas (servicio_id) values (p_servicio_id)
  returning * into v_formula;

  return v_formula;
end;
$$;

-- agregar_formula_item: agrega un medicamento en nomenclatura DCI a la fórmula.
create or replace function agregar_formula_item(
  p_formula_id uuid,
  p_dci text,
  p_dosis text,
  p_via text,
  p_frecuencia text,
  p_duracion text,
  p_instrucciones text,
  p_contiene_controlada boolean
)
returns formula_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item formula_items%rowtype;
begin
  if not exists (
    select 1 from formulas f join servicios s on s.id = f.servicio_id
    where f.id = p_formula_id and s.medico_id = auth.uid()
  ) then
    raise exception 'Fórmula no encontrada o no pertenece al médico actual';
  end if;

  insert into formula_items (formula_id, dci, dosis, via, frecuencia, duracion, instrucciones, contiene_controlada)
  values (p_formula_id, p_dci, p_dosis, p_via, p_frecuencia, p_duracion, p_instrucciones, p_contiene_controlada)
  returning * into v_item;

  return v_item;
end;
$$;

-- eliminar_formula_item: quita un medicamento de la fórmula.
create or replace function eliminar_formula_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from formula_items fi
  using formulas f, servicios s
  where fi.id = p_item_id
    and fi.formula_id = f.id
    and f.servicio_id = s.id
    and s.medico_id = auth.uid();

  if not found then
    raise exception 'Ítem no encontrado o no pertenece al médico actual';
  end if;
end;
$$;

-- actualizar_estado_formula: BORRADOR / APROBADA / DESCARTADA. P3 — el
-- médico aprueba explícitamente, nada se autogenera ni se envía solo.
create or replace function actualizar_estado_formula(p_formula_id uuid, p_estado text)
returns formulas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formula formulas%rowtype;
begin
  if p_estado not in ('borrador', 'aprobada', 'descartada') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  update formulas f
    set estado = p_estado
    from servicios s
    where f.id = p_formula_id
      and f.servicio_id = s.id
      and s.medico_id = auth.uid()
  returning f.* into v_formula;

  if not found then
    raise exception 'Fórmula no encontrada o no pertenece al médico actual';
  end if;

  return v_formula;
end;
$$;

-- No se agregan policies nuevas: soap_notas / formulas / formula_items ya
-- están correctamente restringidas al médico dueño desde 0001 (D-043 y
-- equivalente para fórmula). Este archivo solo agrega columnas, una
-- constraint de unicidad por servicio, y los RPC de escritura.
