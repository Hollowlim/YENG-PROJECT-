-- Run in Supabase SQL Editor as postgres after creating and verifying your Auth account.
-- Replace YOUR_ADMIN_EMAIL_HERE below with that account's email before running.
-- This grants catalogue access only; it never creates accounts or changes passwords.
begin;

do $$
declare
  admin_email text := trim('YOUR_ADMIN_EMAIL_HERE');
  target_user_id uuid;
  confirmed_at timestamptz;
begin
  if admin_email = '' or position('@' in admin_email) = 0 then
    raise exception 'Replace YOUR_ADMIN_EMAIL_HERE with your verified Auth account email.';
  end if;

  begin
    select id, email_confirmed_at into strict target_user_id, confirmed_at
      from auth.users
      where lower(email) = lower(admin_email);
  exception
    when no_data_found then
      raise exception 'No Auth account found for this email. Create the account in Authentication first.';
    when too_many_rows then
      raise exception 'More than one Auth account matches this email. Resolve the duplicate accounts before granting admin access.';
  end;

  if confirmed_at is null then
    raise exception 'This Auth account has not verified its email. Complete email verification before granting admin access.';
  end if;

  insert into public.admin_users (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;
end;
$$;

commit;
select 'Admin access enabled' as status;
