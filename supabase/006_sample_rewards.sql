-- CROWNNETIC: isolated SAMPLE points for new no-charge invoices.
-- Run this ONE file after 001-004, whether or not 005 was installed.
-- Existing invoices receive zero points; their historical items stay unchanged.
-- SAMPLE points never enter loyalty_events, paid sales, revenue or stock.
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
  points integer not null default 0 check (points >= 0),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  email_status text not null default 'pending' check (email_status in ('pending','not_configured','restricted','sending','accepted','failed')),
  email_error text not null default '',
  email_provider_id text,
  email_attempted_at timestamptz,
  email_accepted_at timestamptz,
  email_first_attempt_at timestamptz,
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  email_claim_id uuid,
  email_retry_blocked boolean not null default false,
  email_claim_provider text check (email_claim_provider in ('sendgrid', 'resend')),
  unique (user_id, request_id)
);
-- Upgrades from 005 retain every old invoice/item and default historical points to zero.
alter table public.sample_orders add column if not exists points integer not null default 0 check (points >= 0);
alter table public.sample_orders add column if not exists email_retry_blocked boolean not null default false;
-- NULL preserves the historical Resend behavior for old invoices/claims.
alter table public.sample_orders add column if not exists email_claim_provider text
  check (email_claim_provider in ('sendgrid', 'resend'));
-- 005 and earlier 006 installations used the same generated constraint name.
alter table public.sample_orders drop constraint if exists sample_orders_email_status_check;
alter table public.sample_orders add constraint sample_orders_email_status_check
  check (email_status in ('pending','not_configured','restricted','sending','accepted','failed','review'));
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
  entry jsonb;
  reward integer;
  quantity integer;
  declared_points bigint;
  calculated_points bigint := 0;
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
  -- Replay above intentionally returns an immutable old invoice before validating
  -- new reward snapshots, including invoices created before SAMPLE points existed.
  if jsonb_typeof(order_data->'points') is distinct from 'number'
     or coalesce(order_data->>'points', '') !~ '^[0-9]{1,10}$' then
    raise exception 'Invalid sample points';
  end if;
  declared_points := (order_data->>'points')::bigint;
  if declared_points > 2147483647 then raise exception 'Invalid sample points'; end if;
  if jsonb_typeof(order_data->'items') is distinct from 'array' then
    raise exception 'Between 1 and 100 sample items are required';
  end if;
  if jsonb_array_length(order_data->'items') not between 1 and 100 then
    raise exception 'Between 1 and 100 sample items are required';
  end if;
  for entry in select * from jsonb_array_elements(order_data->'items') loop
    -- New invoices require the server's per-item points snapshot explicitly.
    if jsonb_typeof(entry->'quantity') is distinct from 'number'
       or coalesce(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
       or jsonb_typeof(entry->'reward_points') is distinct from 'number'
       or coalesce(entry->>'reward_points', '') !~ '^(0|[1-9][0-9]{0,5})$' then
      raise exception 'Invalid sample reward item';
    end if;
    quantity := (entry->>'quantity')::integer;
    reward := (entry->>'reward_points')::integer;
    if reward > 100000 then raise exception 'Invalid sample reward item'; end if;
    calculated_points := calculated_points + quantity::bigint * reward;
    if calculated_points > 2147483647 then raise exception 'Sample reward total too large'; end if;
  end loop;
  if declared_points <> calculated_points then
    raise exception 'Sample points do not match the item reward snapshots';
  end if;
  insert into public.sample_orders (
    id, request_id, user_id, customer_name, customer_email, billing_address,
    postcode, country, items, subtotal_sen, shipping_sen, total_sen, item_count, request_payload, points
  ) values (
    (order_data->>'id')::uuid, request, customer_id,
    order_data->>'customer_name', verified_email, order_data->>'billing_address',
    order_data->>'postcode', order_data->>'country', order_data->'items',
    (order_data->>'subtotal_sen')::integer, (order_data->>'shipping_sen')::integer,
    (order_data->>'total_sen')::integer, (order_data->>'item_count')::integer,
    order_data->'request_payload', calculated_points::integer
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
  if invoice.email_status in ('accepted', 'review') or invoice.email_retry_blocked then
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_attempted_at > current_time_at - interval '60 seconds' then
    -- Keep a live sending claim unchanged so its worker can still finish.
    update public.sample_orders set email_error = 'Please wait before requesting another invoice email.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_status = 'sending' and invoice.email_claim_provider = 'sendgrid' then
    update public.sample_orders set email_status = 'review', email_retry_blocked = true,
      email_error = 'The previous email attempt could not be confirmed. Store review is required before another send.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_first_attempt_at is not null
     and invoice.email_first_attempt_at <= current_time_at - interval '23 hours' then
    update public.sample_orders set email_status = 'review', email_retry_blocked = true,
      email_error = 'Email delivery needs store review before another attempt.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_attempt_count >= 5 then
    update public.sample_orders set email_status = 'review', email_retry_blocked = true,
      email_error = 'Email delivery needs store review after five attempts.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  update public.sample_orders set email_status = 'sending', email_error = '',
    email_attempt_count = email_attempt_count + 1,
    email_first_attempt_at = coalesce(email_first_attempt_at, current_time_at),
    email_attempted_at = current_time_at, email_claim_id = gen_random_uuid(), email_claim_provider = 'resend'
    where id = p_order_id returning * into invoice;
  return to_jsonb(invoice) || jsonb_build_object('email_claimed', true);
end;
$$;

-- SendGrid has no idempotency key: an expired sending lease is ambiguous and
-- must never authorize a second send, including after switching providers.
create or replace function public.claim_sample_invoice_email_once(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.sample_orders%rowtype;
  result jsonb;
begin
  select * into invoice from public.sample_orders where id = p_order_id for update;
  if not found then raise exception 'Sample invoice not found'; end if;
  if invoice.email_status in ('accepted', 'review') or invoice.email_retry_blocked then
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  if invoice.email_status = 'sending' then
    if invoice.email_attempted_at > now() - interval '60 seconds' then
      return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
    end if;
    update public.sample_orders set email_status = 'review', email_retry_blocked = true,
      email_error = 'The previous email attempt could not be confirmed. Store review is required before another send.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  -- Older handlers could label an unknown Resend outcome "failed" without a
  -- provider marker. Do not switch that historical attempt to non-idempotent mail.
  if invoice.email_status = 'failed' and invoice.email_attempt_count > 0
     and invoice.email_claim_provider is null then
    update public.sample_orders set email_status = 'review', email_retry_blocked = true,
      email_error = 'The historical email attempt could not be confirmed. Store review is required before another send.'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', false);
  end if;
  -- Known non-delivery uses the existing cooldown, attempt cap and 23-hour bound.
  result := public.claim_sample_invoice_email(p_order_id);
  if (result->>'email_claimed')::boolean then
    update public.sample_orders set email_claim_provider = 'sendgrid'
      where id = p_order_id returning * into invoice;
    return to_jsonb(invoice) || jsonb_build_object('email_claimed', true);
  end if;
  return result;
end;
$$;

create or replace function public.mark_sample_invoice_email_unknown(
  p_order_id uuid, p_claim_id uuid, p_error text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.sample_orders%rowtype;
begin
  select * into invoice from public.sample_orders where id = p_order_id for update;
  if not found then raise exception 'Sample invoice not found'; end if;
  if invoice.email_status = 'accepted' or p_claim_id is null
     or invoice.email_claim_id is distinct from p_claim_id then
    return to_jsonb(invoice);
  end if;
  update public.sample_orders set email_status = 'review', email_retry_blocked = true,
    email_error = left(coalesce(nullif(trim(p_error), ''),
      'The email outcome could not be confirmed. Store review is required before another send.'), 500)
    where id = p_order_id returning * into invoice;
  return to_jsonb(invoice);
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
  if invoice.email_status = 'accepted' or invoice.email_status not in ('sending', 'review')
     or p_claim_id is null or invoice.email_claim_id is distinct from p_claim_id then
    return to_jsonb(invoice);
  end if;
  if provider is not null and failure is null then
    update public.sample_orders set email_status = 'accepted', email_error = '', email_retry_blocked = false,
      email_provider_id = provider, email_accepted_at = now()
      where id = p_order_id returning * into invoice;
  elsif invoice.email_status = 'sending' and not invoice.email_retry_blocked then
    update public.sample_orders set email_status = 'failed',
      email_error = left(coalesce(failure, 'Email provider did not accept the invoice.'), 500)
      where id = p_order_id returning * into invoice;
  end if;
  return to_jsonb(invoice);
end;
$$;
revoke all on function public.create_sample_order(jsonb) from public, anon, authenticated;
revoke all on function public.claim_sample_invoice_email(uuid) from public, anon, authenticated;
revoke all on function public.claim_sample_invoice_email_once(uuid) from public, anon, authenticated;
revoke all on function public.mark_sample_invoice_email_unknown(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_sample_invoice_email(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_sample_order(jsonb) to service_role;
grant execute on function public.claim_sample_invoice_email(uuid) to service_role;
grant execute on function public.claim_sample_invoice_email_once(uuid) to service_role;
grant execute on function public.mark_sample_invoice_email_unknown(uuid, uuid, text) to service_role;
grant execute on function public.finish_sample_invoice_email(uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
select '006 complete: isolated SAMPLE invoice points' as status;
