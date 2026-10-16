-- CROWNETIC: complete, rerunnable setup for this project's Supabase schema.
-- Run this whole file in SQL Editor as postgres instead of running 001/002/003/004.
-- Existing rows are preserved. Named application policies are refreshed atomically.
-- The product-images bucket is public; uploaded product photos are public assets.
begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (category in ('Tees', 'Bottoms', 'Accessories')),
  description text not null check (length(trim(description)) between 1 and 2500),
  price_sen integer not null check (price_sen >= 0),
  image_url text not null check (image_url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.product_variants (
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null check (length(trim(size)) between 1 and 20),
  stock integer not null default 0 check (stock >= 0),
  primary key (product_id, size)
);
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

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.loyalty_events enable row level security;

create or replace function public.is_catalog_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_catalog_admin() from public, anon, authenticated;
grant execute on function public.is_catalog_admin() to anon, authenticated;

-- Reset only this project's named policies. No application rows are deleted.
drop policy if exists "Read own admin membership" on public.admin_users;
create policy "Read own admin membership" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Read published products or own admin catalogue" on public.products;
create policy "Read published products or own admin catalogue" on public.products
  for select to anon, authenticated using (published or public.is_catalog_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
  for all to authenticated using (public.is_catalog_admin())
  with check (public.is_catalog_admin());
drop policy if exists "Read variants of published products" on public.product_variants;
create policy "Read variants of published products" on public.product_variants
  for select to anon, authenticated using (exists (
    select 1 from public.products p where p.id = product_id
      and (p.published or public.is_catalog_admin())
  ));
drop policy if exists "Admins manage variants" on public.product_variants;
create policy "Admins manage variants" on public.product_variants
  for all to authenticated using (public.is_catalog_admin())
  with check (public.is_catalog_admin());
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

revoke all on public.admin_users, public.products, public.product_variants,
  public.customer_profiles, public.loyalty_events from public, anon, authenticated;
grant select on public.products, public.product_variants to anon;
grant select, insert, update, delete on public.products, public.product_variants to authenticated;
grant select on public.admin_users, public.loyalty_events to authenticated;
grant select, insert, update on public.customer_profiles to authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Admins upload product photos" on storage.objects;
create policy "Admins upload product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_catalog_admin());
drop policy if exists "Admins edit product photos" on storage.objects;
create policy "Admins edit product photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin())
  with check (bucket_id = 'product-images' and public.is_catalog_admin());
drop policy if exists "Admins delete product photos" on storage.objects;
create policy "Admins delete product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin());
drop policy if exists "Read product photos" on storage.objects;
create policy "Read product photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');

-- BEGIN ADMIN PORTAL (004)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null check (length(trim(reference)) between 1 and 120),
  user_id uuid not null references auth.users(id),
  channel text not null check (channel in ('instagram', 'offline', 'website')),
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  total_sen integer not null check (total_sen >= 0),
  points integer not null check (points >= 0),
  item_count integer not null check (item_count > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  fulfillment_status text not null default 'unfulfilled'
    check (fulfillment_status in ('unfulfilled', 'processing', 'shipped', 'delivered')),
  tracking_number text not null default '' check (length(tracking_number) <= 200),
  refund_reason text not null default '' check (length(refund_reason) <= 500),
  refunded_at timestamptz
);
create unique index if not exists orders_reference_unique on public.orders (lower(reference));
create index if not exists orders_customer_created on public.orders (user_id, created_at desc);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  size text not null,
  quantity integer not null check (quantity between 1 and 9999),
  unit_price_sen integer not null check (unit_price_sen >= 0),
  reward_points integer not null check (reward_points between 0 and 100000)
);
create index if not exists order_items_order on public.order_items (order_id);
create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('sale_recorded', 'points_adjusted', 'order_refunded', 'fulfillment_updated')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  customer_email text not null default '',
  reference text not null default '',
  summary text not null,
  created_at timestamptz not null default now(),
  request_id uuid unique,
  request_payload jsonb,
  result_id uuid,
  check ((request_id is null and request_payload is null)
    or (request_id is not null and request_payload is not null))
);
create index if not exists admin_activity_created on public.admin_activity (created_at desc);

alter table public.loyalty_events
  add column if not exists event_type text not null default 'purchase',
  add column if not exists reason text not null default '',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists order_id uuid references public.orders(id);
-- Replace only the checks created by this project's earlier rewards migration.
-- Signed adjustments/refunds are ledger entries; existing purchases remain unchanged.
alter table public.loyalty_events
  drop constraint if exists loyalty_events_points_check,
  drop constraint if exists loyalty_events_item_count_check,
  drop constraint if exists loyalty_events_event_type_check,
  drop constraint if exists loyalty_events_reason_check,
  drop constraint if exists loyalty_events_event_shape_check;
alter table public.loyalty_events
  add constraint loyalty_events_item_count_check check (item_count >= 0),
  add constraint loyalty_events_event_type_check check (event_type in ('purchase', 'adjustment', 'refund')),
  add constraint loyalty_events_reason_check check (length(reason) <= 500),
  add constraint loyalty_events_event_shape_check check (
    (event_type = 'purchase' and points >= 0 and item_count > 0)
    or (event_type = 'adjustment' and points <> 0 and item_count = 0)
    or (event_type = 'refund' and points <= 0)
  );
create unique index if not exists loyalty_events_order_type_unique
  on public.loyalty_events (order_id, event_type)
  where order_id is not null and event_type in ('purchase', 'refund');

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_activity enable row level security;
drop policy if exists "Customers or admins read orders" on public.orders;
create policy "Customers or admins read orders" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_catalog_admin());
drop policy if exists "Customers or admins read order items" on public.order_items;
create policy "Customers or admins read order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (o.user_id = (select auth.uid()) or public.is_catalog_admin())));
drop policy if exists "Admins read activity" on public.admin_activity;
create policy "Admins read activity" on public.admin_activity for select to authenticated
  using (public.is_catalog_admin());
revoke all on public.orders, public.order_items, public.admin_activity from public, anon, authenticated;
grant select on public.orders, public.order_items, public.admin_activity to authenticated;
-- Customer profile and reward SELECT policies remain restricted to their owner.
revoke insert, update, delete on public.loyalty_events from public, anon, authenticated;

create or replace function public.admin_portal_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  with customers as (
    select u.id, u.email,
      coalesce(nullif(trim(p.display_name), ''), nullif(left(trim(u.raw_user_meta_data->>'name'), 80), ''), split_part(u.email, '@', 1)) as name,
      coalesce(p.phone, '') as phone, coalesce(p.address, '') as address, u.created_at,
      coalesce((select sum(e.points) from public.loyalty_events e where e.user_id = u.id), 0) as points,
      coalesce((select sum(o.total_sen) from public.orders o where o.user_id = u.id and o.status = 'paid'), 0) as total_spent_sen,
      (select count(*) from public.orders o where o.user_id = u.id) as order_count,
      (select max(o.created_at) from public.orders o where o.user_id = u.id and o.status = 'paid') as last_purchase_at
    from auth.users u left join public.customer_profiles p on p.user_id = u.id
    where nullif(trim(u.email), '') is not null and u.email_confirmed_at is not null
      and not exists (select 1 from public.admin_users a where a.user_id = u.id)
  ), order_data as (
    select to_jsonb(o) || jsonb_build_object(
      'customer_name', coalesce(nullif(trim(p.display_name), ''), nullif(left(trim(u.raw_user_meta_data->>'name'), 80), ''), split_part(u.email, '@', 1)),
      'customer_email', u.email,
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name, i.size, i.id)
        from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) as data, o.created_at, o.id
    from public.orders o join auth.users u on u.id = o.user_id
      left join public.customer_profiles p on p.user_id = o.user_id
  ), event_data as (
    select to_jsonb(e) || jsonb_build_object(
      'customer_name', coalesce(nullif(trim(p.display_name), ''), nullif(left(trim(u.raw_user_meta_data->>'name'), 80), ''), split_part(u.email, '@', 1)),
      'customer_email', u.email
    ) as data, e.created_at, e.id
    from public.loyalty_events e join auth.users u on u.id = e.user_id
      left join public.customer_profiles p on p.user_id = e.user_id
  ), activity_data as (
    select a.id, a.action, a.actor_email, a.customer_email, a.reference, a.summary, a.created_at
    from public.admin_activity a
  )
  select jsonb_build_object(
    'customers', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc, c.id) from customers c), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(o.data order by o.created_at desc, o.id) from order_data o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e.data order by e.created_at desc, e.id) from event_data e), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id) from activity_data a), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_record_sale(sale_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
<<sale>>
declare
  request_id uuid; customer_id uuid; sale_ref text; sale_channel text; payload jsonb;
  previous public.admin_activity%rowtype; customer_email text; actor_email text;
  order_id uuid := gen_random_uuid(); entry jsonb; product_id uuid; variant_size text;
  product_name text; price integer; per_item integer; qty integer;
  total bigint := 0; points_total bigint := 0; quantity_total bigint := 0;
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  request_id := (sale_data->>'request_id')::uuid;
  customer_id := (sale_data->>'user_id')::uuid;
  sale_ref := trim(sale_data->>'reference');
  sale_channel := sale_data->>'channel';
  if request_id is null or customer_id is null then raise exception 'Customer and request ID are required'; end if;
  if sale_ref is null or length(sale_ref) not between 1 and 120 then raise exception 'Reference must contain 1 to 120 characters'; end if;
  if sale_channel is null or sale_channel not in ('instagram', 'offline', 'website') then raise exception 'Invalid sales channel'; end if;
  if jsonb_typeof(sale_data->'items') is distinct from 'array' then raise exception 'Items are required'; end if;
  if jsonb_array_length(sale_data->'items') not between 1 and 100 then raise exception 'Record between 1 and 100 items'; end if;
  payload := jsonb_build_object('user_id', customer_id, 'reference', lower(sale_ref), 'channel', sale_channel, 'items', sale_data->'items');
  perform pg_advisory_xact_lock(hashtextextended('crownetic.admin.request:' || request_id::text, 0));
  select * into previous from public.admin_activity a where a.request_id = sale.request_id;
  if found then
    if previous.action <> 'sale_recorded' or previous.request_payload <> payload then raise exception 'Request ID was already used for a different action'; end if;
    return previous.result_id;
  end if;
  select u.email into customer_email from auth.users u
    where u.id = customer_id and u.email_confirmed_at is not null and nullif(trim(u.email), '') is not null
      and not exists (select 1 from public.admin_users a where a.user_id = u.id)
    for update of u;
  if not found then raise exception 'Select a verified customer account'; end if;
  if exists (select 1 from public.orders o where lower(o.reference) = lower(sale_ref)) then raise exception 'This sale reference is already recorded'; end if;
  select u.email into actor_email from auth.users u where u.id = auth.uid();
  insert into public.orders(id, reference, user_id, channel, total_sen, points, item_count, created_by)
    values(order_id, sale_ref, customer_id, sale_channel, 0, 0, 1, auth.uid());
  for entry in select * from jsonb_array_elements(sale_data->'items') loop
    if coalesce(entry->>'quantity', '') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Quantity must be an integer from 1 to 9999'; end if;
    qty := (entry->>'quantity')::integer;
    product_id := (entry->>'product_id')::uuid;
    variant_size := entry->>'size';
    select p.name, p.price_sen, p.reward_points into product_name, price, per_item
      from public.products p join public.product_variants v on v.product_id = p.id
      where p.id = sale.product_id and v.size = variant_size for share of p, v;
    if not found then raise exception 'Select an existing product and size'; end if;
    if exists (select 1 from public.order_items i where i.order_id = sale.order_id and i.product_id = sale.product_id and i.size = variant_size) then raise exception 'Combine duplicate product sizes into one item'; end if;
    total := total + qty * price::bigint;
    points_total := points_total + qty * per_item::bigint;
    quantity_total := quantity_total + qty;
    if total > 2147483647 or points_total > 2147483647 or quantity_total > 2147483647 then raise exception 'Sale total is too large'; end if;
    insert into public.order_items(order_id, product_id, name, size, quantity, unit_price_sen, reward_points)
      values(order_id, product_id, product_name, variant_size, qty, price, per_item);
  end loop;
  update public.orders o set total_sen = total::integer, points = points_total::integer, item_count = quantity_total::integer where o.id = order_id;
  insert into public.loyalty_events(event_ref, user_id, points, item_count, event_type, created_by, order_id)
    values('order-purchase:' || order_id::text, customer_id, points_total::integer, quantity_total::integer, 'purchase', auth.uid(), order_id);
  insert into public.admin_activity(action, actor_id, actor_email, user_id, customer_email, reference, summary, request_id, request_payload, result_id)
    values('sale_recorded', auth.uid(), coalesce(actor_email, ''), customer_id, customer_email, sale_ref,
      'Recorded ' || sale_channel || ' sale: ' || quantity_total::text || ' item(s), ' || points_total::text || ' points', request_id, payload, order_id);
  return order_id;
end;
$$;

create or replace function public.admin_adjust_points(adjustment_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
<<adjustment>>
declare
  request_id uuid; customer_id uuid; delta integer; note text; payload jsonb;
  previous public.admin_activity%rowtype; customer_email text; actor_email text;
  balance bigint; event_id uuid := gen_random_uuid();
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  request_id := (adjustment_data->>'request_id')::uuid;
  customer_id := (adjustment_data->>'user_id')::uuid;
  if coalesce(adjustment_data->>'points', '') !~ '^-?[0-9]+$' then raise exception 'Points must be an integer'; end if;
  if length(adjustment_data->>'points') > 7 then raise exception 'Adjust between 1 and 100000 points'; end if;
  delta := (adjustment_data->>'points')::integer;
  note := trim(adjustment_data->>'reason');
  if request_id is null or customer_id is null then raise exception 'Customer and request ID are required'; end if;
  if delta = 0 or abs(delta::bigint) > 100000 then raise exception 'Adjust between 1 and 100000 points'; end if;
  if note is null or length(note) not between 3 and 500 then raise exception 'Reason must contain 3 to 500 characters'; end if;
  payload := jsonb_build_object('user_id', customer_id, 'points', delta, 'reason', note);
  perform pg_advisory_xact_lock(hashtextextended('crownetic.admin.request:' || request_id::text, 0));
  select * into previous from public.admin_activity a where a.request_id = adjustment.request_id;
  if found then
    if previous.action <> 'points_adjusted' or previous.request_payload <> payload then raise exception 'Request ID was already used for a different action'; end if;
    return previous.result_id;
  end if;
  select u.email into customer_email from auth.users u
    where u.id = customer_id and u.email_confirmed_at is not null and nullif(trim(u.email), '') is not null
      and not exists (select 1 from public.admin_users a where a.user_id = u.id)
    for update of u;
  if not found then raise exception 'Select a verified customer account'; end if;
  select coalesce(sum(e.points), 0) into balance from public.loyalty_events e where e.user_id = customer_id;
  if delta < 0 and balance + delta < 0 then raise exception 'Deduction exceeds the customer point balance'; end if;
  select u.email into actor_email from auth.users u where u.id = auth.uid();
  insert into public.loyalty_events(id, event_ref, user_id, points, item_count, event_type, reason, created_by)
    values(event_id, 'admin-adjustment:' || request_id::text, customer_id, delta, 0, 'adjustment', note, auth.uid());
  insert into public.admin_activity(action, actor_id, actor_email, user_id, customer_email, reference, summary, request_id, request_payload, result_id)
    values('points_adjusted', auth.uid(), coalesce(actor_email, ''), customer_id, customer_email,
      'admin-adjustment:' || request_id::text, 'Adjusted points by ' || delta::text || ': ' || note, request_id, payload, event_id);
  return event_id;
end;
$$;

create or replace function public.admin_refund_order(p_order_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.orders%rowtype; customer_id uuid; purchase_points integer; purchase_items integer;
  note text := trim(p_reason); customer_email text; actor_email text;
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if note is null or length(note) not between 3 and 500 then raise exception 'Reason must contain 3 to 500 characters'; end if;
  select o.user_id into customer_id from public.orders o where o.id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  perform 1 from auth.users u where u.id = customer_id for update;
  select * into target from public.orders o where o.id = p_order_id for update;
  if target.status = 'refunded' then
    if target.refund_reason <> note then raise exception 'This order is already refunded with a different reason'; end if;
    return target.id;
  end if;
  select e.points, e.item_count into purchase_points, purchase_items from public.loyalty_events e
    where e.order_id = target.id and e.event_type = 'purchase';
  if not found then raise exception 'Original purchase award is missing; review this order before refunding'; end if;
  select u.email into customer_email from auth.users u where u.id = customer_id;
  select u.email into actor_email from auth.users u where u.id = auth.uid();
  insert into public.loyalty_events(event_ref, user_id, points, item_count, event_type, reason, created_by, order_id)
    values('order-refund:' || target.id::text, customer_id, -purchase_points, purchase_items, 'refund', note, auth.uid(), target.id);
  update public.orders o set status = 'refunded', refund_reason = note, refunded_at = now() where o.id = target.id;
  insert into public.admin_activity(action, actor_id, actor_email, user_id, customer_email, reference, summary, result_id)
    values('order_refunded', auth.uid(), coalesce(actor_email, ''), customer_id, coalesce(customer_email, ''), target.reference,
      'Refunded recorded sale and reversed ' || purchase_points::text || ' points: ' || note, target.id);
  return target.id;
end;
$$;

create or replace function public.admin_update_fulfillment(p_order_id uuid, p_status text, p_tracking_number text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.orders%rowtype; tracking text := trim(coalesce(p_tracking_number, ''));
  customer_email text; actor_email text; customer_id uuid;
begin
  if not public.is_catalog_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('unfulfilled', 'processing', 'shipped', 'delivered') then raise exception 'Invalid fulfillment status'; end if;
  if length(tracking) > 200 then raise exception 'Tracking number must contain at most 200 characters'; end if;
  -- Match refund's customer-before-order lock order, including the audit FKs.
  select o.user_id into customer_id from public.orders o where o.id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  perform 1 from auth.users u where u.id = customer_id for update;
  select * into target from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target.status <> 'paid' then raise exception 'Refunded orders cannot change fulfillment'; end if;
  if target.fulfillment_status = p_status and target.tracking_number = tracking then return target.id; end if;
  select u.email into customer_email from auth.users u where u.id = target.user_id;
  select u.email into actor_email from auth.users u where u.id = auth.uid();
  update public.orders o set fulfillment_status = p_status, tracking_number = tracking where o.id = target.id;
  insert into public.admin_activity(action, actor_id, actor_email, user_id, customer_email, reference, summary, result_id)
    values('fulfillment_updated', auth.uid(), coalesce(actor_email, ''), target.user_id, coalesce(customer_email, ''), target.reference,
      'Changed fulfillment to ' || p_status || case when tracking = '' then '' else ' (' || tracking || ')' end, target.id);
  return target.id;
end;
$$;

revoke all on function public.admin_portal_snapshot() from public, anon, authenticated;
revoke all on function public.admin_record_sale(jsonb) from public, anon, authenticated;
revoke all on function public.admin_adjust_points(jsonb) from public, anon, authenticated;
revoke all on function public.admin_refund_order(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_fulfillment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_portal_snapshot() to authenticated;
grant execute on function public.admin_record_sale(jsonb) to authenticated;
grant execute on function public.admin_adjust_points(jsonb) to authenticated;
grant execute on function public.admin_refund_order(uuid, text) to authenticated;
grant execute on function public.admin_update_fulfillment(uuid, text, text) to authenticated;

-- END ADMIN PORTAL (004)
notify pgrst, 'reload schema';
commit;

-- BEGIN SAMPLE CHECKOUT (005)
-- CROWNNETIC: no-charge sample invoices, separate from paid sales and rewards.
-- Run after 001-004. Rerunnable; existing sample invoices are preserved.
begin;
create table if not exists public.sample_orders (
  id uuid primary key,
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text generated always as ('SAMPLE-' || upper(id::text)) stored unique,
  created_at timestamptz not null default now(),
  status text not null default 'sample_completed' check (status = 'sample_completed'),
  currency text not null default 'MYR' check (currency = 'MYR'),
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email text not null check (length(customer_email) between 1 and 254),
  billing_address text not null check (length(billing_address) <= 400),
  postcode text not null check (length(postcode) <= 20),
  country text not null check (length(country) <= 80),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  subtotal_sen integer not null check (subtotal_sen >= 0),
  shipping_sen integer not null default 0 check (shipping_sen = 0),
  total_sen integer not null check (total_sen = subtotal_sen),
  item_count integer not null check (item_count > 0),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  email_status text not null default 'pending' check (email_status in ('pending','not_configured','restricted','sending','accepted','failed')),
  email_error text not null default '',
  email_provider_id text,
  email_attempted_at timestamptz,
  email_accepted_at timestamptz,
  email_first_attempt_at timestamptz,
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  email_claim_id uuid,
  unique (user_id, request_id)
);
create index if not exists sample_orders_customer_created on public.sample_orders(user_id, created_at desc);
alter table public.sample_orders enable row level security;
drop policy if exists "Customers read own sample invoices" on public.sample_orders;
create policy "Customers read own sample invoices" on public.sample_orders for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.sample_orders from public, anon, authenticated;
grant select on public.sample_orders to authenticated;
grant select, insert, update on public.sample_orders to service_role;

-- A narrowly scoped definer is needed to lock the verified auth.users row.
-- Execution is service-role-only; no new auth.users privileges are granted.
-- Catalog snapshots/totals must already be validated by the trusted checkout server.
create or replace function public.create_sample_order(order_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer_id uuid := (order_data->>'user_id')::uuid;
  request uuid := (order_data->>'request_id')::uuid;
  verified_email text;
  existing public.sample_orders%rowtype;
  result public.sample_orders%rowtype;
begin
  if jsonb_typeof(order_data) is distinct from 'object' or customer_id is null or request is null then
    raise exception 'A customer and sample request are required';
  end if;
  -- Serialize creation/quota checks per customer, including concurrent retries.
  select u.email into verified_email from auth.users u
    where u.id = customer_id and u.email_confirmed_at is not null
      and nullif(trim(u.email), '') is not null for update;
  if not found then raise exception 'A verified customer is required'; end if;
  if lower(trim(order_data->>'customer_email')) is distinct from lower(trim(verified_email)) then
    raise exception 'Invoice email must match the verified customer email';
  end if;
  select * into existing from public.sample_orders o
    where o.user_id = customer_id and o.request_id = request;
  if found then
    if existing.request_payload is distinct from order_data->'request_payload' then
      raise exception 'This sample request ID was already used for different information';
    end if;
    return to_jsonb(existing);
  end if;
  if (select count(*) from public.sample_orders o where o.user_id = customer_id
      and o.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= 10 then
    raise exception 'Daily sample invoice limit reached. Please try again tomorrow';
  end if;
  insert into public.sample_orders (
    id, request_id, user_id, customer_name, customer_email, billing_address,
    postcode, country, items, subtotal_sen, shipping_sen, total_sen, item_count, request_payload
  ) values (
    (order_data->>'id')::uuid, request, customer_id,
    order_data->>'customer_name', verified_email, order_data->>'billing_address',
    order_data->>'postcode', order_data->>'country', order_data->'items',
    (order_data->>'subtotal_sen')::integer, (order_data->>'shipping_sen')::integer,
    (order_data->>'total_sen')::integer, (order_data->>'item_count')::integer,
    order_data->'request_payload'
  ) returning * into result;
  -- created_at comes from the database clock, preventing a supplied timestamp bypassing quota.
  return to_jsonb(result);
end;
$$;

create or replace function public.claim_sample_invoice_email(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.sample_orders%rowtype;
  current_time_at timestamptz := now();
begin
  select * into invoice from public.sample_orders where id = p_order_id for update;
  if not found then raise exception 'Sample invoice not found'; end if;
  if invoice.email_status = 'accepted' then
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_attempted_at > current_time_at - interval '60 seconds' then
    -- Keep a live sending claim unchanged so its worker can still finish.
    update public.sample_orders set email_error = 'Please wait before requesting another invoice email.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_first_attempt_at is not null
     and invoice.email_first_attempt_at <= current_time_at - interval '23 hours' then
    update public.sample_orders set email_status = 'failed',
      email_error = 'Email delivery needs store review before another attempt.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_attempt_count >= 5 then
    update public.sample_orders set email_status = 'failed',
      email_error = 'Email delivery needs store review after five attempts.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  update public.sample_orders set email_status = 'sending', email_error = '',
    email_attempt_count = email_attempt_count + 1,
    email_first_attempt_at = coalesce(email_first_attempt_at, current_time_at),
    email_attempted_at = current_time_at, email_claim_id = gen_random_uuid()
    where id = p_order_id returning * into invoice;
  return to_jsonb(invoice) || jsonb_build_object('email_claimed', true);
end;
$$;

create or replace function public.finish_sample_invoice_email(
  p_order_id uuid, p_claim_id uuid, p_provider_id text, p_error text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.sample_orders%rowtype;
  provider text := nullif(trim(p_provider_id), '');
  failure text := nullif(trim(p_error), '');
begin
  select * into invoice from public.sample_orders where id = p_order_id for update;
  if not found then raise exception 'Sample invoice not found'; end if;
  if invoice.email_status = 'accepted' or invoice.email_status <> 'sending'
     or p_claim_id is null or invoice.email_claim_id is distinct from p_claim_id then
    return to_jsonb(invoice);
  end if;
  if provider is not null and failure is null then
    update public.sample_orders set email_status = 'accepted', email_error = '',
      email_provider_id = provider, email_accepted_at = now()
      where id = p_order_id returning * into invoice;
  else
    update public.sample_orders set email_status = 'failed',
      email_error = left(coalesce(failure, 'Email provider did not accept the invoice.'), 500)
      where id = p_order_id returning * into invoice;
  end if;
  return to_jsonb(invoice);
end;
$$;
revoke all on function public.create_sample_order(jsonb) from public, anon, authenticated;
revoke all on function public.claim_sample_invoice_email(uuid) from public, anon, authenticated;
revoke all on function public.finish_sample_invoice_email(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_sample_order(jsonb) to service_role;
grant execute on function public.claim_sample_invoice_email(uuid) to service_role;
grant execute on function public.finish_sample_invoice_email(uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
select '005 complete: isolated no-charge sample invoices' as status;

-- END SAMPLE CHECKOUT (005)

select 'CROWNETIC database setup complete' as status;
-- Real admin accounts and email confirmation are configured separately in Auth.
-- No sample password, API key, or automatic admin membership is installed here.
