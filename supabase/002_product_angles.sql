-- Run after 001_catalog.sql; supports optional product angle photography.
begin;
alter table public.products add column if not exists view_left text not null default '' check (view_left = '' or view_left ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$');
alter table public.products add column if not exists view_right text not null default '' check (view_right = '' or view_right ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$');
alter table public.products add column if not exists view_sprite text not null default '' check (view_sprite = '' or view_sprite ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$');
create or replace function public.save_product(product_data jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare pid uuid := (product_data->>'id')::uuid; variant jsonb;
begin
 if not public.is_catalog_admin() then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(product_data->'variants') is distinct from 'array' or jsonb_array_length(product_data->'variants') = 0 then raise exception 'At least one size is required'; end if;
 insert into public.products(id,name,category,description,price_sen,image_url,published,view_left,view_right,view_sprite)
 values(pid,product_data->>'name',product_data->>'category',product_data->>'description',(product_data->>'price_sen')::integer,product_data->>'image_url',(product_data->>'published')::boolean,coalesce(product_data->>'view_left',''),coalesce(product_data->>'view_right',''),coalesce(product_data->>'view_sprite',''))
 on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,price_sen=excluded.price_sen,image_url=excluded.image_url,published=excluded.published,view_left=excluded.view_left,view_right=excluded.view_right,view_sprite=excluded.view_sprite;
 delete from public.product_variants where product_id=pid;
 for variant in select * from jsonb_array_elements(product_data->'variants') loop
  insert into public.product_variants(product_id,size,stock) values(pid,variant->>'size',(variant->>'stock')::integer);
 end loop;
 return pid;
end;
$$;
commit;
