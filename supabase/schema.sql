-- =====================================================================
-- Κοστολόγηση Ψητοπωλείου Παπαχρήστου — σχήμα βάσης (Supabase / Postgres)
-- Όλοι οι πίνακες έχουν πρόθεμα kost_ ώστε να μπορεί να μοιραστεί project.
-- Εκτέλεση: Supabase → SQL Editor → επικόλληση όλου του αρχείου → Run.
-- =====================================================================

-- ---------- Προφίλ χρηστών & ρόλοι ----------
create table if not exists public.kost_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create or replace function public.kost_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.kost_profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.kost_is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.kost_profiles where id = auth.uid());
$$;

-- ---------- Προμηθευτές ----------
create table if not exists public.kost_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Πρώτες ύλες (χωρίς τιμές — τις βλέπει και το προσωπικό) ----------
create table if not exists public.kost_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  unit text not null check (unit in ('kg','lt','τεμ')),       -- μονάδα αγοράς
  yield_pct numeric(5,2) not null default 100 check (yield_pct > 0 and yield_pct <= 100), -- απόδοση μετά από καθάρισμα/ψήσιμο
  supplier_id uuid references public.kost_suppliers(id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Τιμές αγοράς (ΜΟΝΟ admin) ----------
create table if not exists public.kost_ingredient_prices (
  ingredient_id uuid primary key references public.kost_ingredients(id) on delete cascade,
  price numeric(10,4) not null default 0 check (price >= 0),  -- καθαρή τιμή (χωρίς ΦΠΑ) ανά μονάδα αγοράς
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.kost_price_history (
  id bigint generated always as identity primary key,
  ingredient_id uuid not null references public.kost_ingredients(id) on delete cascade,
  old_price numeric(10,4),
  new_price numeric(10,4) not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);
create index if not exists kost_price_history_ing_idx on public.kost_price_history(ingredient_id, changed_at desc);

create or replace function public.kost_log_price()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    new.updated_at := now();
    new.updated_by := auth.uid();
    insert into public.kost_price_history(ingredient_id, old_price, new_price, changed_by)
    values (new.ingredient_id, case when tg_op = 'UPDATE' then old.price end, new.price, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists kost_price_log on public.kost_ingredient_prices;
create trigger kost_price_log before insert or update on public.kost_ingredient_prices
for each row execute function public.kost_log_price();

-- ---------- Συνταγές (πιάτα & ενδιάμεσα παρασκευάσματα) ----------
create table if not exists public.kost_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  is_sub boolean not null default false,          -- true = ενδιάμεσο (σάλτσα, μαρινάδα, ζύμη…)
  yield_qty numeric(10,3) not null default 1 check (yield_qty > 0),
  yield_unit text not null default 'μερίδα' check (yield_unit in ('μερίδα','kg','lt','τεμ')),
  selling_price numeric(10,2),                    -- τιμή καταλόγου ΜΕ ΦΠΑ, ανά μερίδα
  vat_rate numeric(4,2) not null default 13,
  target_food_cost numeric(5,2) not null default 30,
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kost_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.kost_recipes(id) on delete cascade,
  ingredient_id uuid references public.kost_ingredients(id) on delete restrict,
  sub_recipe_id uuid references public.kost_recipes(id) on delete restrict,
  qty numeric(10,3) not null check (qty > 0),
  unit text not null check (unit in ('g','kg','ml','lt','τεμ','μερίδα')),
  note text,
  sort int not null default 0,
  check ((ingredient_id is null) <> (sub_recipe_id is null)),
  check (sub_recipe_id is null or sub_recipe_id <> recipe_id)
);
create index if not exists kost_recipe_items_recipe_idx on public.kost_recipe_items(recipe_id);

-- ---------- RLS ----------
alter table public.kost_profiles          enable row level security;
alter table public.kost_suppliers         enable row level security;
alter table public.kost_ingredients       enable row level security;
alter table public.kost_ingredient_prices enable row level security;
alter table public.kost_price_history     enable row level security;
alter table public.kost_recipes           enable row level security;
alter table public.kost_recipe_items      enable row level security;

-- Προφίλ: ο καθένας βλέπει το δικό του, ο admin όλα. Αλλαγές μόνο μέσω server (service role).
drop policy if exists kost_profiles_read on public.kost_profiles;
create policy kost_profiles_read on public.kost_profiles for select to authenticated
  using (id = auth.uid() or public.kost_is_admin());

-- Ανάγνωση για όλα τα μέλη, εγγραφή μόνο admin
do $$
declare t text;
begin
  foreach t in array array['kost_suppliers','kost_ingredients','kost_recipes','kost_recipe_items'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.kost_is_member())', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.kost_is_admin()) with check (public.kost_is_admin())', t);
  end loop;
end $$;

-- Τιμές & ιστορικό: ΜΟΝΟ admin
drop policy if exists kost_prices_admin on public.kost_ingredient_prices;
create policy kost_prices_admin on public.kost_ingredient_prices for all to authenticated
  using (public.kost_is_admin()) with check (public.kost_is_admin());

drop policy if exists kost_history_admin on public.kost_price_history;
create policy kost_history_admin on public.kost_price_history for select to authenticated
  using (public.kost_is_admin());

-- Οι helper functions δεν χρειάζεται να καλούνται από anon
revoke execute on function public.kost_is_admin() from public, anon;
revoke execute on function public.kost_is_member() from public, anon;
grant execute on function public.kost_is_admin() to authenticated;
grant execute on function public.kost_is_member() to authenticated;
revoke execute on function public.kost_log_price() from public, anon, authenticated;
