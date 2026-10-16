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
