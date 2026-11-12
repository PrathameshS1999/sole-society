-- Sole Society: Supabase schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Then run seed.sql. Safe to re-run: it drops and recreates the shop tables
-- (customer accounts in auth.users are not touched).

-- ===================================================================
-- Clean slate
-- ===================================================================
drop function if exists public.place_order(text, jsonb, jsonb, boolean);
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.contact_messages, public.order_items, public.orders,
  public.wishlist_items, public.addresses, public.profiles, public.reviews,
  public.product_sizes, public.product_images, public.product_colours, public.products cascade;

-- ===================================================================
-- Catalogue (readable by everyone, editable only from the dashboard)
-- ===================================================================
create table public.products (
  slug             text primary key check (slug ~ '^[a-z0-9-]+$'),
  brand            text not null,
  name             text not null,
  type             text not null check (type in ('boots','trainers','school','formal','socks')),
  departments      text[] not null default '{}',           -- any of: women, men, kids
  price            numeric(10,2) not null check (price >= 0),
  was_price        numeric(10,2) check (was_price is null or was_price > price),
  rating           numeric(2,1) check (rating is null or rating between 0 and 5),
  review_count     integer check (review_count is null or review_count >= 0),
  rating_breakdown jsonb,                                   -- [{"stars":5,"pct":82,"count":79}, …]
  badge            text check (badge in ('new','sale')),
  widths           text[] not null default '{Standard}',
  swatch_dots      text[],                                  -- hex colours for the card dots (defaults to the colours)
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.product_colours (
  id           bigint generated always as identity primary key,
  product_slug text not null references public.products(slug) on delete cascade on update cascade,
  name         text not null,
  hex          text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  family       text not null check (family in ('black','brown','stone','olive','navy','red','pink','orange')),
  image        text,                                        -- photo shown when this colour is picked
  position     integer not null default 0,
  unique (product_slug, name)
);

create table public.product_images (
  id           bigint generated always as identity primary key,
  product_slug text not null references public.products(slug) on delete cascade on update cascade,
  url          text not null,                               -- relative (images/…) or a full https:// URL
  position     integer not null default 0                   -- 0 is the main photo
);

create table public.product_sizes (
  product_slug text not null references public.products(slug) on delete cascade on update cascade,
  size         text not null,
  stock        text not null default 'unknown' check (stock in ('in','low','out','unknown')),
  position     integer not null default 0,
  primary key (product_slug, size)
);

create table public.reviews (
  id           bigint generated always as identity primary key,
  product_slug text not null references public.products(slug) on delete cascade on update cascade,
  stars        integer not null check (stars between 1 and 5),
  title        text not null,
  body         text not null,
  is_sample    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index on public.product_colours (product_slug);
create index on public.product_images (product_slug);
create index on public.reviews (product_slug);

-- ===================================================================
-- Customers
-- ===================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text check (char_length(full_name) <= 200),
  created_at timestamptz not null default now()
);

create table public.addresses (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name  text not null check (char_length(full_name) <= 200),
  address_1  text not null check (char_length(address_1) <= 200),
  address_2  text check (char_length(address_2) <= 200),
  town       text not null check (char_length(town) <= 100),
  county     text not null check (char_length(county) <= 100),
  eircode    text not null check (char_length(eircode) <= 20),
  phone      text check (char_length(phone) <= 40),
  created_at timestamptz not null default now()
);
create index on public.addresses (user_id);

create table public.wishlist_items (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_slug text not null references public.products(slug) on delete cascade on update cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, product_slug)
);

-- ===================================================================
-- Orders (created only through place_order(), which prices them server-side)
-- ===================================================================
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id      uuid references auth.users(id) on delete set null,   -- null for guest checkout
  email        text not null,
  status       text not null default 'placed (test mode)',
  subtotal     numeric(10,2) not null,
  delivery_fee numeric(10,2),                                       -- null = not yet set (orders under €50)
  total        numeric(10,2) not null,
  address      jsonb not null,
  created_at   timestamptz not null default now()
);
create index on public.orders (user_id);

create table public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_slug text references public.products(slug) on delete set null on update cascade,
  product_name text not null,
  colour       text not null,
  size         text not null,
  width        text not null,
  qty          integer not null check (qty between 1 and 9),
  unit_price   numeric(10,2) not null
);
create index on public.order_items (order_id);

-- ===================================================================
-- Contact form (write-only from the site; read it in the dashboard)
-- ===================================================================
create table public.contact_messages (
  id           bigint generated always as identity primary key,
  name         text not null check (char_length(name) between 1 and 200),
  email        text not null check (char_length(email) between 3 and 320),
  order_number text check (char_length(order_number) <= 40),
  message      text not null check (char_length(message) between 1 and 5000),
  created_at   timestamptz not null default now()
);

-- ===================================================================
-- Row Level Security: the public key in js/config.js can only do what these allow
-- ===================================================================
alter table public.products         enable row level security;
alter table public.product_colours  enable row level security;
alter table public.product_images   enable row level security;
alter table public.product_sizes    enable row level security;
alter table public.reviews          enable row level security;
alter table public.profiles         enable row level security;
alter table public.addresses        enable row level security;
alter table public.wishlist_items   enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.contact_messages enable row level security;

-- Catalogue: anyone can read active products and their details
create policy "read active products" on public.products for select to anon, authenticated using (active);
create policy "read colours" on public.product_colours for select to anon, authenticated using (true);
create policy "read images"  on public.product_images  for select to anon, authenticated using (true);
create policy "read sizes"   on public.product_sizes   for select to anon, authenticated using (true);
create policy "read reviews" on public.reviews         for select to anon, authenticated using (true);

-- Profiles: a customer sees and edits only their own
create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Addresses: a customer manages only their own
create policy "own addresses read"   on public.addresses for select to authenticated using (user_id = auth.uid());
create policy "own addresses add"    on public.addresses for insert to authenticated with check (user_id = auth.uid());
create policy "own addresses delete" on public.addresses for delete to authenticated using (user_id = auth.uid());

-- Wishlist: a customer manages only their own
create policy "own wishlist read"   on public.wishlist_items for select to authenticated using (user_id = auth.uid());
create policy "own wishlist add"    on public.wishlist_items for insert to authenticated with check (user_id = auth.uid());
create policy "own wishlist delete" on public.wishlist_items for delete to authenticated using (user_id = auth.uid());

-- Orders: a signed-in customer can read their own; nobody can write directly
create policy "own orders read" on public.orders for select to authenticated using (user_id = auth.uid());
create policy "own order items read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Contact: anyone can send, nobody can read from the site
create policy "send contact message" on public.contact_messages for insert to anon, authenticated with check (true);

-- Table privileges (RLS above still applies on top of these)
grant select on public.products, public.product_colours, public.product_images, public.product_sizes, public.reviews to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.addresses, public.wishlist_items to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant insert on public.contact_messages to anon, authenticated;

-- ===================================================================
-- New sign-ups get a profile row (name comes from the register form)
-- ===================================================================
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 200));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================
-- place_order: the only way to create an order.
-- Prices, sizes, colours and widths are checked against the catalogue here,
-- so a visitor can't change a price in their browser.
-- ===================================================================
create function public.place_order(p_email text, p_address jsonb, p_items jsonb, p_save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_number   text;
  v_sub      numeric(10,2) := 0;
  v_fee      numeric(10,2);
  v_item     jsonb;
  v_prod     public.products%rowtype;
  v_qty      integer;
  v_addr     jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your basket is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many lines in one order.';
  end if;
  if p_email is null or char_length(p_email) > 320 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;

  v_addr := jsonb_build_object(
    'full_name', left(coalesce(p_address ->> 'full_name', ''), 200),
    'address_1', left(coalesce(p_address ->> 'address_1', ''), 200),
    'address_2', left(coalesce(p_address ->> 'address_2', ''), 200),
    'town',      left(coalesce(p_address ->> 'town', ''), 100),
    'county',    left(coalesce(p_address ->> 'county', ''), 100),
    'eircode',   left(coalesce(p_address ->> 'eircode', ''), 20),
    'phone',     left(coalesce(p_address ->> 'phone', ''), 40));
  if v_addr ->> 'full_name' = '' or v_addr ->> 'address_1' = '' or v_addr ->> 'town' = ''
     or v_addr ->> 'county' = '' or v_addr ->> 'eircode' = '' then
    raise exception 'Please complete the delivery address.';
  end if;

  v_number := 'SS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (order_number, user_id, email, subtotal, total, address)
  values (v_number, auth.uid(), p_email, 0, 0, v_addr)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_prod from public.products where slug = v_item ->> 'slug' and active;
    if not found then
      raise exception 'A product in your basket is no longer available.';
    end if;
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 9 then
      raise exception 'Invalid quantity for %.', v_prod.name;
    end if;
    if not exists (select 1 from public.product_sizes s
                   where s.product_slug = v_prod.slug and s.size = v_item ->> 'size' and s.stock <> 'out') then
      raise exception 'Size % of % is not available.', v_item ->> 'size', v_prod.name;
    end if;
    if not exists (select 1 from public.product_colours c
                   where c.product_slug = v_prod.slug and c.name = v_item ->> 'colour') then
      raise exception 'That colour of % is not available.', v_prod.name;
    end if;
    if not ((v_item ->> 'width') = any (v_prod.widths)) then
      raise exception 'That width of % is not available.', v_prod.name;
    end if;
    insert into public.order_items (order_id, product_slug, product_name, colour, size, width, qty, unit_price)
    values (v_order_id, v_prod.slug, v_prod.name, v_item ->> 'colour', v_item ->> 'size', v_item ->> 'width', v_qty, v_prod.price);
    v_sub := v_sub + v_prod.price * v_qty;
  end loop;

  -- Free delivery over €50 (from the design system). The charge below €50 isn't
  -- known yet: replace null with the amount, e.g. 4.95, and match it in js/main.js.
  v_fee := case when v_sub >= 50 then 0 else null end;
  update public.orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + coalesce(v_fee, 0)
  where id = v_order_id;

  if p_save_address and auth.uid() is not null then
    insert into public.addresses (user_id, full_name, address_1, address_2, town, county, eircode, phone)
    values (auth.uid(), v_addr ->> 'full_name', v_addr ->> 'address_1', nullif(v_addr ->> 'address_2', ''),
            v_addr ->> 'town', v_addr ->> 'county', v_addr ->> 'eircode', nullif(v_addr ->> 'phone', ''));
  end if;

  return jsonb_build_object('order_number', v_number, 'total', v_sub + coalesce(v_fee, 0));
end;
$$;
revoke all on function public.place_order(text, jsonb, jsonb, boolean) from public;
grant execute on function public.place_order(text, jsonb, jsonb, boolean) to anon, authenticated;
