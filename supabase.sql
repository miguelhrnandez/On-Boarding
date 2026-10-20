-- ============================================================
-- Onboarding PAI · base de datos en Supabase
-- Pegar todo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Todos los datos de la página (entrevistas, ajustes, dólar) en una sola tabla.
create table if not exists public.onb_docs (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists onb_docs_fecha on public.onb_docs (col, (data->>'fecha'));
alter table public.onb_docs replica identity full;
alter table public.onb_docs enable row level security;

drop policy if exists "onb leer"   on public.onb_docs;
drop policy if exists "onb crear"  on public.onb_docs;
drop policy if exists "onb editar" on public.onb_docs;
drop policy if exists "onb borrar" on public.onb_docs;
create policy "onb leer"   on public.onb_docs for select to anon, authenticated using (true);
create policy "onb crear"  on public.onb_docs for insert to anon, authenticated with check (col in ('entrevistas','ajustes','dolar'));
create policy "onb editar" on public.onb_docs for update to anon, authenticated using (col in ('entrevistas','ajustes','dolar')) with check (col in ('entrevistas','ajustes','dolar'));
create policy "onb borrar" on public.onb_docs for delete to anon, authenticated using (col = 'entrevistas');

-- Cambios en vivo para todos los que tienen la página abierta.
do $$ begin
  alter publication supabase_realtime add table public.onb_docs;
exception when duplicate_object then null; end $$;

-- Actualización parcial de un documento (para revisiones y seguimientos).
create or replace function public.onb_doc_update(p_col text, p_id text, p_patch jsonb)
returns void language sql security invoker as $$
  update public.onb_docs set data = data || p_patch, updated_at = now()
  where col = p_col and id = p_id;
$$;

-- PIN de la responsable: se guarda cifrado y nadie lo puede leer desde la página.
create table if not exists public.onb_pin (
  id          int primary key default 1 check (id = 1),
  hash        text not null,
  actualizado timestamptz not null default now()
);
alter table public.onb_pin enable row level security;  -- sin políticas: solo se usa con las funciones de abajo

create or replace function public.onb_pin_info() returns text
language sql security definer set search_path = public, extensions as $$
  select to_char(actualizado, 'YYYYMMDDHH24MISSMS') from public.onb_pin where id = 1;
$$;

create or replace function public.onb_pin_verificar(p text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform pg_sleep(0.4);  -- frena intentos repetidos
  return exists (select 1 from public.onb_pin where id = 1 and hash = crypt(coalesce(p, ''), hash));
end $$;

create or replace function public.onb_pin_cambiar(actual text, nuevo text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if nuevo is null or nuevo !~ '^[0-9]{4,6}$' then return false; end if;
  if exists (select 1 from public.onb_pin where id = 1) then
    perform pg_sleep(0.4);
    if not exists (select 1 from public.onb_pin where id = 1 and hash = crypt(coalesce(actual, ''), hash)) then return false; end if;
    update public.onb_pin set hash = crypt(nuevo, gen_salt('bf')), actualizado = now() where id = 1;
  else
    insert into public.onb_pin (id, hash) values (1, crypt(nuevo, gen_salt('bf')));
  end if;
  return true;
end $$;

grant execute on function public.onb_doc_update(text, text, jsonb) to anon, authenticated;
grant execute on function public.onb_pin_info() to anon, authenticated;
grant execute on function public.onb_pin_verificar(text) to anon, authenticated;
grant execute on function public.onb_pin_cambiar(text, text) to anon, authenticated;

-- Datos cargados hasta ahora en la versión de Claude (no pisa nada si ya existen).
insert into public.onb_docs (col, id, data) values
  ('ajustes', 'general', '{"actualizado": "2026-10-20T18:13:35.404Z", "asesores": ["Samuel L", "Matias F"], "equipo": ["Geraldine", "Tamara P"], "metaEnt": 0, "metaMonto": 0, "minimo": 150000, "pct": 20, "plazoMeses": 1, "sucursales": ["Liniers"], "tope": 1000000}'::jsonb),
  ('entrevistas', '5cxzz252wto2l2v5zbq2', '{"actualizado": "2026-10-20T17:48:48.641Z", "actualizadoPor": "u_fKH4a2zfZIJlewbHjmhWgg", "ahorro": 0, "asesor": "Matias F", "checklist": {"c1": "si", "c2": "si", "c3": "si", "c4": "si", "c5": "si", "d1": "si", "d2": "no", "d3": "si", "d4": "no", "d5": "si", "i1": "si", "i2": "si", "i3": "si", "i4": "si", "i5": "si", "i6": "si", "k1": "si", "k2": "si", "k3": "si", "k4": "si", "k5": "si", "k6": "si", "p1": "si", "p2": "si", "p3": "si", "p4": "si", "r1": "no", "r2": "si", "r3": "no", "r4": "si", "r5": "no", "v1": "si", "v2": "no", "v3": "si", "v4": "no", "v5": "si", "v6": "no", "v7": "si"}, "cliente": "Pepito Reyes", "contrato": "1", "creado": "2026-10-20T17:21:01.498Z", "creadoPor": "u_fKH4a2zfZIJlewbHjmhWgg", "cuotaAsesor": 200000, "cuotaFinal": 350000, "dni": "56560251", "especialista": "Geraldine", "estado": "final", "fallaAsesor": "si", "fallaDetalle": "Hablo mal", "fallaTipos": ["Promesa incorrecta"], "fecha": "2026-10-20", "finalizado": "2026-10-20T17:21:01.498Z", "gestiones": [], "mes": "2026-10", "observaciones": "", "pct": 20, "plazoMeses": 1, "revision": {"estado": "aprobada", "fecha": "2026-10-20T17:49:30.619Z", "nota": "Montos modificados después de la revisión.", "por": "u_fKH4a2zfZIJlewbHjmhWgg"}, "seguimiento": "si", "seguimientoAcuerdo": "2026-10-20", "seguimientoDetalle": "AHORRO PACTADO EL 11/11", "seguimientoFecha": "2026-11-20", "seguimientoMonto": 1000000, "seguimientoResuelto": false, "seguimientoResueltoFecha": null, "seguimientoTipo": "ahorro", "sucursal": "Liniers", "telefono": "1195264812", "tope": 1000000}'::jsonb),
  ('dolar', '2026-09-21', '{"egreso": 1612, "fecha": "2026-09-21", "fuente": "spazios.com.ar/indices2", "ingreso": 1484.1}'::jsonb),
  ('dolar', '2026-09-22', '{"egreso": 1617.2, "fecha": "2026-09-22", "fuente": "spazios.com.ar/indices2", "ingreso": 1488.95}'::jsonb),
  ('dolar', '2026-09-23', '{"egreso": 1622.4, "fecha": "2026-09-23", "fuente": "spazios.com.ar/indices2", "ingreso": 1493.8}'::jsonb),
  ('dolar', '2026-09-24', '{"egreso": 1622.4, "fecha": "2026-09-24", "fuente": "spazios.com.ar/indices2", "ingreso": 1493.8}'::jsonb),
  ('dolar', '2026-09-25', '{"egreso": 1622.4, "fecha": "2026-09-25", "fuente": "spazios.com.ar/indices2", "ingreso": 1493.8}'::jsonb),
  ('dolar', '2026-09-28', '{"egreso": 1627.6, "fecha": "2026-09-28", "fuente": "spazios.com.ar/indices2", "ingreso": 1498.65}'::jsonb),
  ('dolar', '2026-09-29', '{"egreso": 1617.2, "fecha": "2026-09-29", "fuente": "spazios.com.ar/indices2", "ingreso": 1488.95}'::jsonb),
  ('dolar', '2026-09-30', '{"egreso": 1622.4, "fecha": "2026-09-30", "fuente": "spazios.com.ar/indices2", "ingreso": 1493.8}'::jsonb),
  ('dolar', '2026-10-01', '{"egreso": 1617.2, "fecha": "2026-10-01", "fuente": "spazios.com.ar/indices2", "ingreso": 1488.95}'::jsonb),
  ('dolar', '2026-10-02', '{"egreso": 1622.4, "fecha": "2026-10-02", "fuente": "spazios.com.ar/indices2", "ingreso": 1493.8}'::jsonb),
  ('dolar', '2026-10-05', '{"egreso": 1612, "fecha": "2026-10-05", "fuente": "spazios.com.ar/indices2", "ingreso": 1484.1}'::jsonb),
  ('dolar', '2026-10-06', '{"egreso": 1606.8, "fecha": "2026-10-06", "fuente": "spazios.com.ar/indices2", "ingreso": 1479.25}'::jsonb),
  ('dolar', '2026-10-07', '{"egreso": 1617.2, "fecha": "2026-10-07", "fuente": "spazios.com.ar/indices2", "ingreso": 1488.95}'::jsonb),
  ('dolar', '2026-10-08', '{"egreso": 1606.8, "fecha": "2026-10-08", "fuente": "spazios.com.ar/indices2", "ingreso": 1479.25}'::jsonb),
  ('dolar', '2026-10-13', '{"egreso": 1612, "fecha": "2026-10-13", "fuente": "spazios.com.ar/indices2", "ingreso": 1484.1}'::jsonb),
  ('dolar', '2026-10-14', '{"egreso": 1612, "fecha": "2026-10-14", "fuente": "spazios.com.ar/indices2", "ingreso": 1484.1}'::jsonb),
  ('dolar', '2026-10-15', '{"egreso": 1606.8, "fecha": "2026-10-15", "fuente": "spazios.com.ar/indices2", "ingreso": 1479.25}'::jsonb),
  ('dolar', '2026-10-16', '{"egreso": 1606.8, "fecha": "2026-10-16", "fuente": "spazios.com.ar/indices2", "ingreso": 1479.25}'::jsonb),
  ('dolar', '2026-10-19', '{"egreso": 1617.2, "fecha": "2026-10-19", "fuente": "spazios.com.ar/indices2", "ingreso": 1488.95}'::jsonb),
  ('dolar', '2026-10-20', '{"egreso": 1632.8, "fecha": "2026-10-20", "fuente": "spazios.com.ar/indices2", "ingreso": 1503.5}'::jsonb)
on conflict (col, id) do nothing;
