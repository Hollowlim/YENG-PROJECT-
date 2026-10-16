-- Rerunnable CROWNETIC setup: existing rows are preserved.
-- 003: customer profiles and loyalty rewards. Run after 001 and 002.
-- Existing catalogue access stays restricted to admins.
begin;

alter table public.products
  add column if not exists view_left text not null default ''
    check (view_left = '' or view_left ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  add column if not exists view_right text not null default ''
    check (view_right = '' or view_right ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  add column if not exists view_sprite text not null default ''
    check (view_sprite = '' or view_sprite ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  add column if not exists reward_points integer not null default 100
    check (reward_points between 0 and 100000);
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  phone text not null default '' check (length(phone) <= 30),
  address text not null default '' check (length(address) <= 400)
);
create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  event_ref text not null unique check (length(event_ref) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null check (points >= 0),
  item_count integer not null check (item_count > 0),
  created_at timestamptz not null default now()
);
create index if not exists loyalty_events_customer
  on public.loyalty_events (user_id, created_at desc);

alter table public.customer_profiles enable row level security;
alter table public.loyalty_events enable row level security;

drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own profile" on public.customer_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Customers create own profile" on public.customer_profiles;
create policy "Customers create own profile" on public.customer_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Customers update own profile" on public.customer_profiles;
create policy "Customers update own profile" on public.customer_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Customers read own rewards" on public.loyalty_events;
create policy "Customers read own rewards" on public.loyalty_events
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.customer_profiles, public.loyalty_events
  from public, anon, authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select on public.loyalty_events to authenticated;

-- One transaction saves product details, photography, points and size stock.
create or replace function public.save_product(product_data jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  pid uuid := (product_data->>'id')::uuid;
  variant jsonb;
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required';
  end if;
  if jsonb_typeof(product_data->'variants') is distinct from 'array'
     or jsonb_array_length(product_data->'variants') = 0 then
    raise exception 'At least one size is required';
  end if;
  insert into public.products (
    id, name, category, description, price_sen, image_url, published,
    view_left, view_right, view_sprite, reward_points
  ) values (
    pid, product_data->>'name', product_data->>'category',
    product_data->>'description', (product_data->>'price_sen')::integer,
    product_data->>'image_url', (product_data->>'published')::boolean,
    coalesce(product_data->>'view_left', ''),
    coalesce(product_data->>'view_right', ''),
    coalesce(product_data->>'view_sprite', ''),
    coalesce((product_data->>'reward_points')::integer, 100)
  ) on conflict (id) do update set
    name = excluded.name, category = excluded.category,
    description = excluded.description, price_sen = excluded.price_sen,
    image_url = excluded.image_url, published = excluded.published,
    view_left = excluded.view_left, view_right = excluded.view_right,
    view_sprite = excluded.view_sprite, reward_points = excluded.reward_points;
  delete from public.product_variants where product_id = pid;
  for variant in select * from jsonb_array_elements(product_data->'variants') loop
    insert into public.product_variants (product_id, size, stock)
    values (pid, variant->>'size', (variant->>'stock')::integer);
  end loop;
  return pid;
end;
$$;
revoke all on function public.save_product(jsonb) from public, anon, authenticated;
grant execute on function public.save_product(jsonb) to authenticated;

-- Only a trusted server may award points AFTER verifying a paid order.
-- This installs the function; it does not create payment processing.
create or replace function public.award_purchase_points(
  p_user uuid, p_order_ref text, p_items jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  total_points bigint := 0;
  total_items bigint := 0;
  entry jsonb;
  qty integer;
  per_item integer;
  inserted_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Items required';
  end if;
  for entry in select * from jsonb_array_elements(p_items) loop
    if coalesce(entry->>'quantity', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Invalid quantity';
    end if;
    qty := (entry->>'quantity')::integer;
    select reward_points into per_item from public.products
      where id = (entry->>'product_id')::uuid;
    if not found then raise exception 'Unknown product'; end if;
    total_points := total_points + qty * per_item::bigint;
    total_items := total_items + qty;
  end loop;
  if total_points > 2147483647 or total_items > 2147483647 then
    raise exception 'Reward total too large';
  end if;
  insert into public.loyalty_events (user_id, event_ref, points, item_count)
  values (p_user, p_order_ref, total_points::integer, total_items::integer)
  on conflict (event_ref) do nothing returning id into inserted_id;
  return case when inserted_id is null then 0 else total_points::integer end;
end;
$$;
revoke all on function public.award_purchase_points(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_purchase_points(uuid, text, jsonb) to service_role;
grant select on public.products to service_role;
grant select, insert on public.loyalty_events to service_role;

notify pgrst, 'reload schema';
commit;
select '003 complete: customer profiles and rewards' as status;
