-- Rerunnable CROWNETIC setup: existing rows are preserved.
-- 001: products, admin access and public product-photo storage.
-- For a new project run 001, 002, then 003; setup.sql combines all three.
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
alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;

create or replace function public.is_catalog_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_catalog_admin() from public, anon, authenticated;
grant execute on function public.is_catalog_admin() to anon, authenticated;

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
revoke all on public.admin_users, public.products, public.product_variants
  from public, anon, authenticated;
grant select on public.products, public.product_variants to anon;
grant select, insert, update, delete on public.products, public.product_variants to authenticated;
grant select on public.admin_users to authenticated;

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

notify pgrst, 'reload schema';
commit;
select '001 complete: products and admin access' as status;
-- Create an Auth account separately before adding its UUID to admin_users.
-- No admin membership or sample password is installed by this script.
