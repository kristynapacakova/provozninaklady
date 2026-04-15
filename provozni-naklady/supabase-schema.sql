-- Spusť v Supabase SQL Editoru

create table if not exists naklady (
  id uuid primary key default gen_random_uuid(),
  mesic integer not null check (mesic >= 1 and mesic <= 12),
  rok integer not null default extract(year from now())::integer,
  nazev text not null,
  ucet_bez_dph numeric(12,2) default 0,
  cl_bez_dph numeric(12,2) default 0,
  ucet_s_dph numeric(12,2) default 0,
  cl_s_dph numeric(12,2) default 0,
  stav text not null default 'ok' check (stav in ('ok', 'chybi', 'rozdil')),
  poznamka text default '',
  poradi integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index pro rychlé dotazy dle měsíce/roku
create index if not exists naklady_mesic_rok on naklady(rok, mesic);

-- Automatický update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger naklady_updated_at
  before update on naklady
  for each row execute function update_updated_at();

-- Vzorová data
insert into naklady (mesic, rok, nazev, ucet_bez_dph, cl_bez_dph, ucet_s_dph, cl_s_dph, stav, poradi)
values
  (4, 2026, 'Nájem kanceláře', 25000, 25000, 30250, 30250, 'ok', 1),
  (4, 2026, 'Telefony', 3200, 3200, 3872, 3872, 'ok', 2),
  (4, 2026, 'Internet', 890, 890, 1077.9, 1077.9, 'ok', 3),
  (4, 2026, 'Účetní software', 1490, 0, 1802.9, 0, 'chybi', 4),
  (4, 2026, 'Adobe Creative Cloud', 4500, 4200, 5445, 5082, 'rozdil', 5);
