# Feed Forward Meals

A production-quality web app built with Vanilla HTML, CSS, JavaScript, and Supabase. It connects food donors, customers, and delivery partners with an emphasis on a clean, accessible, matte-black UI.

## Getting Started

1. **Clone/Download** the repository.
2. **Setup Supabase**: Create a Supabase project at [https://supabase.com](https://supabase.com).
3. **Configure the App**:
   - Open `supabase.js`.
   - Replace the `SUPABASE_URL` and `SUPABASE_ANON_KEY` variables with your actual Supabase project credentials.
4. **Run the App**:
   Since it uses ES modules and imports, you need to run it through a local development server.
   Using Node.js:
   ```bash
   npx serve .
   ```
   Or use VS Code Live Server extension.
5. Open `http://localhost:3000` (or whichever port is provided) in your browser.

## Supabase Database Schema

To set up your database, go to the **SQL Editor** in your Supabase Dashboard and run the following queries:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. Create Tables
-- ==========================================

-- Orders
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  food_item text not null,
  quantity integer not null,
  address text not null,
  contact text not null,
  payment_method text not null,
  status text not null default 'placed',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Donations
create table public.donations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  food_details text not null,
  quantity integer not null,
  location text not null,
  contact text not null,
  status text not null default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Delivery Partners
create table public.delivery_partners (
  id uuid primary key references auth.users(id),
  name text not null,
  phone text not null,
  location text not null,
  vehicle text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Contacts
create table public.contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 2. Row Level Security (RLS)
-- ==========================================

-- Enable RLS on all tables
alter table public.orders enable row level security;
alter table public.donations enable row level security;
alter table public.delivery_partners enable row level security;
alter table public.contacts enable row level security;

-- Policies for orders
create policy "Users can view their own orders"
  on public.orders for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own orders"
  on public.orders for insert
  with check ( auth.uid() = user_id );

-- Policies for donations
create policy "Users can view their own donations"
  on public.donations for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own donations"
  on public.donations for insert
  with check ( auth.uid() = user_id );

-- Policies for delivery_partners
create policy "Partners can view their own profile"
  on public.delivery_partners for select
  using ( auth.uid() = id );

create policy "Partners can insert their own profile"
  on public.delivery_partners for insert
  with check ( auth.uid() = id );

create policy "Partners can update their own profile"
  on public.delivery_partners for update
  using ( auth.uid() = id );

-- Policies for contacts (Any user can insert, only admins can view - assuming no admin role, deny select)
create policy "Anyone can insert contacts"
  on public.contacts for insert
  with check ( true );
```

## Features Complete

- Vanilla JS Single Page Application (SPA).
- No external UI frameworks.
- Clean Matte Black theme, matching brand guidelines.
- Secure Auth and Row Level Security via Supabase.
- Full Dashboard, Orders, Donations, Partner, and Contact Flows.
- ARIA accessibility updates and Loading indicators.
