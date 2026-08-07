-- ARENA POS Pro — core schema
-- Replaces the 5 Google Sheets (รายรับรายจ่าย, สินค้า, ค้างรับ, เงินสำรองสนาม, Log).
--
-- No login/accounts: anyone who opens the app has full access, same as the
-- original (which only gated destructive actions behind a shared "1234"
-- prompt). There is no `profiles`/roles table and no `created_by` tracking.

create extension if not exists pgcrypto;

-- ============================================================
-- products — replaces "สินค้า". `category` replaces the old
-- detail.includes("สนาม") text-sniffing: a product is tagged once as
-- field_rental and every sale of it reports correctly forever.
-- ============================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'merchandise' check (category in ('merchandise', 'field_rental')),
  cost numeric not null default 0 check (cost >= 0),
  price numeric not null default 0 check (price >= 0),
  stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- transactions — flat ledger, one row per line (same granularity as the
-- original sheet rows). Current balance is a plain aggregate query
-- (sum(income-expense) where payment_method=... and not is_void) — no
-- per-row running-balance formula to rewrite when a row is voided.
-- ============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  product_id uuid references public.products (id),
  product_name text,
  qty numeric,
  unit_price numeric,
  detail text not null,
  income numeric not null default 0 check (income >= 0),
  expense numeric not null default 0 check (expense >= 0),
  cost_total numeric not null default 0,
  profit_total numeric not null default 0,
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  category text not null check (
    category in (
      'product_sale', 'field_rental', 'general_expense', 'stock_purchase',
      'debt_settlement', 'transfer', 'profit_allocation'
    )
  ),
  mode text not null check (mode in ('income', 'expense', 'stock_in', 'settlement', 'transfer', 'allocation')),
  is_void boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create index transactions_occurred_at_idx on public.transactions (occurred_at);
create index transactions_active_idx on public.transactions (payment_method, category) where not is_void;
create index transactions_product_idx on public.transactions (product_id);

-- ============================================================
-- debts — credit sales ("เซ็น"), replaces "ค้างรับ".
-- ============================================================
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  customer_name text not null,
  product_id uuid references public.products (id),
  product_name text,
  qty numeric,
  detail text not null,
  amount numeric not null check (amount > 0),
  cost_total numeric not null default 0,
  profit_total numeric not null default 0,
  remaining_amount numeric not null check (remaining_amount >= 0),
  remaining_cost numeric not null default 0,
  remaining_profit numeric not null default 0,
  status text not null default 'outstanding' check (status in ('outstanding', 'partial', 'paid', 'void')),
  created_at timestamptz not null default now()
);

create index debts_customer_idx on public.debts (customer_name);
create index debts_status_idx on public.debts (status);

-- ============================================================
-- debt_payments / debt_payment_allocations — settlement records. The
-- original had no way to see how a payment split across debt rows; this
-- adds one and makes a settlement reversible.
-- ============================================================
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  amount numeric not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  cost_total numeric not null default 0,
  profit_total numeric not null default 0,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now()
);

create table public.debt_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  debt_payment_id uuid not null references public.debt_payments (id) on delete cascade,
  debt_id uuid not null references public.debts (id),
  amount numeric not null check (amount > 0),
  cost_part numeric not null default 0,
  profit_part numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- profit_allocations — replaces the "จัดสรรกำไรส่วนกลาง" tag-scan. The
-- UNIQUE constraint on `period` is what prevents double-allocation, instead
-- of scanning every ledger row for a matching tag string on every attempt.
-- ============================================================
create table public.profit_allocations (
  id uuid primary key default gen_random_uuid(),
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  period text not null unique,
  net_profit numeric not null,
  scholarship numeric not null,
  emergency numeric not null,
  rotate numeric not null,
  staff numeric not null,
  total_out numeric not null,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- reserve_fund_entries — replaces "เงินสำรองสนาม".
-- ============================================================
create table public.reserve_fund_entries (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  amount numeric not null,
  allocation_id uuid references public.profit_allocations (id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- reports — replaces the Drive-folder file listing. Multiple rows per
-- month are kept on purpose: regenerating a report keeps history instead of
-- silently overwriting the previous file like the original Drive folder did.
-- ============================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  period text not null,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index reports_month_year_idx on public.reports (year, month, created_at desc);

-- ============================================================
-- audit_log — replaces the "Log" sheet. No user identity to attach (no
-- accounts), so this is just a what/when trail, not a who trail.
-- ============================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  amount numeric,
  mode text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
