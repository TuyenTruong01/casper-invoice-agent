create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key,
  original_name text not null,
  storage_path text not null,
  file_hash text not null,
  mime_type text not null,
  size_bytes bigint not null,
  extracted_text text not null default '',
  invoice_number text,
  vendor text,
  invoice_date date,
  due_date date,
  amount numeric,
  currency text,
  recipient_wallet text,
  confidence numeric,
  missing_fields jsonb not null default '[]'::jsonb,
  ai_model text,
  ai_status text not null default 'PENDING',
  ai_error text,
  risk_score integer,
  risk_decision text,
  risk_flags jsonb not null default '[]'::jsonb,
  status text not null default 'UPLOADED',
  proposal_id text,
  deploy_hash text,
  block_height bigint,
  approval_status text not null default 'NOT_REQUESTED',
  execution_status text not null default 'NOT_SUBMITTED',
  execution_error text,
  contract_hash text,
  contract_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_number on public.invoices(invoice_number);
create index if not exists idx_invoices_hash on public.invoices(file_hash);
create index if not exists idx_invoices_vendor on public.invoices(vendor);

create table if not exists public.vendor_profiles (
  vendor text primary key,
  recipient_wallet text not null,
  payment_limit numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id text primary key,
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  invoice_hash text not null unique,
  invoice_number_hash text not null,
  vendor_hash text not null,
  amount bigint not null,
  currency text not null,
  recipient_hash text not null,
  risk_decision text not null,
  status text not null default 'LOCAL_PENDING',
  onchain_status text,
  contract_hash text,
  created_by text,
  approved_by text,
  payment_recorded_by text,
  payment_proof text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blockchain_actions (
  id uuid primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  proposal_id text not null references public.proposals(id) on delete cascade,
  action text not null,
  deploy_hash text,
  execution_status text not null default 'BUILT',
  error_message text,
  block_height bigint,
  transfers_json text not null default '[]',
  caller_public_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blockchain_actions_invoice on public.blockchain_actions(invoice_id);
create unique index if not exists idx_blockchain_actions_deploy_hash
  on public.blockchain_actions(deploy_hash) where deploy_hash is not null;

create table if not exists public.audit_history (
  id bigint generated always as identity primary key,
  invoice_id uuid references public.invoices(id) on delete set null,
  proposal_id text references public.proposals(id) on delete set null,
  event text not null,
  actor text,
  details_json text not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.blockchain_actions enable row level security;
alter table public.audit_history enable row level security;

-- Safe upgrades for databases created by an earlier migration draft.
alter table public.invoices alter column extracted_text set default '';

-- No public table policies are created. All application access uses the server-only service role.
