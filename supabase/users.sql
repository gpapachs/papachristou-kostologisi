-- =====================================================================
-- Κοστολόγηση — διαχείριση χρηστών μέσα στη βάση (χωρίς server).
-- Ίδιο μοτίβο με τις Κρατήσεις, αλλά κάθε συνάρτηση αγγίζει ΜΟΝΟ
-- χρήστες της κοστολόγησης (όσους υπάρχουν στο kost_profiles).
-- Τρέχει μετά το schema.sql.
-- =====================================================================

-- Εσωτερική: φτιάχνει χρήστη auth + προφίλ
create or replace function public._kost_create_user(p_username text, p_password text, p_full_name text, p_role text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, auth
as $$
declare
  v_user  text := lower(trim(p_username));
  v_email text;
  v_id    uuid := gen_random_uuid();
begin
  if v_user !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Το όνομα χρήστη θέλει 3–30 λατινικούς χαρακτήρες, αριθμούς ή . _ -';
  end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'Άγνωστος ρόλος'; end if;
  v_email := v_user || '@kostologisi.papachristou.app';
  if exists (select 1 from public.kost_profiles where username = v_user) or exists (select 1 from auth.users where email = v_email) then
    raise exception 'Το όνομα χρήστη «%» υπάρχει ήδη', v_user;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', coalesce(nullif(trim(p_full_name), ''), v_user), 'app', 'kostologisi'),
    now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  insert into public.kost_profiles (id, username, full_name, role)
  values (v_id, v_user, nullif(trim(p_full_name), ''), p_role);
  return v_id;
end $$;

-- Χρειάζεται αρχική ρύθμιση;
create or replace function public.kost_setup_needed()
returns boolean language sql stable security definer set search_path = public
as $$ select not exists (select 1 from public.kost_profiles); $$;

-- Πρώτος διαχειριστής — δουλεύει ΜΟΝΟ όσο δεν υπάρχει κανένας χρήστης
create or replace function public.kost_setup_admin(p_username text, p_password text, p_full_name text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('kost_setup_admin'));
  if exists (select 1 from public.kost_profiles) then
    raise exception 'Η αρχική ρύθμιση έχει ήδη γίνει';
  end if;
  perform public._kost_create_user(p_username, p_password, p_full_name, 'admin');
end $$;

create or replace function public.kost_admin_create_user(p_username text, p_password text, p_full_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public
as $$
begin
  if not public.kost_is_admin() then raise exception 'Μόνο ο διαχειριστής μπορεί να προσθέσει χρήστες'; end if;
  return public._kost_create_user(p_username, p_password, p_full_name, p_role);
end $$;

create or replace function public.kost_admin_update_user(p_user uuid, p_full_name text, p_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.kost_is_admin() then raise exception 'Μόνο ο διαχειριστής μπορεί να αλλάξει χρήστες'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'Άγνωστος ρόλος'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'Δεν μπορείς να αφαιρέσεις τον ρόλο διαχειριστή από τον εαυτό σου'; end if;
  update public.kost_profiles set full_name = nullif(trim(p_full_name), ''), role = p_role where id = p_user;
  if not found then raise exception 'Ο χρήστης δεν βρέθηκε'; end if;
end $$;

create or replace function public.kost_admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth
as $$
begin
  if not public.kost_is_admin() then raise exception 'Μόνο ο διαχειριστής μπορεί να αλλάξει κωδικούς'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες'; end if;
  if not exists (select 1 from public.kost_profiles where id = p_user) then raise exception 'Ο χρήστης δεν βρέθηκε'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

create or replace function public.kost_admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.kost_is_admin() then raise exception 'Μόνο ο διαχειριστής μπορεί να διαγράψει χρήστες'; end if;
  if p_user = auth.uid() then raise exception 'Δεν μπορείς να διαγράψεις τον εαυτό σου'; end if;
  if not exists (select 1 from public.kost_profiles where id = p_user) then raise exception 'Ο χρήστης δεν βρέθηκε'; end if;
  delete from auth.users where id = p_user;  -- το προφίλ σβήνει μαζί (on delete cascade)
end $$;

-- Δικαιώματα
revoke execute on function public._kost_create_user(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.kost_setup_needed() from public;
revoke execute on function public.kost_setup_admin(text, text, text) from public;
grant  execute on function public.kost_setup_needed() to anon, authenticated;
grant  execute on function public.kost_setup_admin(text, text, text) to anon, authenticated;
revoke execute on function public.kost_admin_create_user(text, text, text, text) from public, anon;
revoke execute on function public.kost_admin_update_user(uuid, text, text) from public, anon;
revoke execute on function public.kost_admin_set_password(uuid, text) from public, anon;
revoke execute on function public.kost_admin_delete_user(uuid) from public, anon;
grant  execute on function public.kost_admin_create_user(text, text, text, text) to authenticated;
grant  execute on function public.kost_admin_update_user(uuid, text, text) to authenticated;
grant  execute on function public.kost_admin_set_password(uuid, text) to authenticated;
grant  execute on function public.kost_admin_delete_user(uuid) to authenticated;
