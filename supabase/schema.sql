create extension if not exists pgcrypto;

create table if not exists borrowers (
  id uuid primary key default gen_random_uuid(), name text not null, phone text,
  whatsapp_number text, email text, address text, notes text,
  created_date timestamptz not null default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(), borrower_id uuid references borrowers(id) on delete cascade,
  loan_number text, principal_amount numeric, annual_interest_rate numeric, monthly_interest_rate numeric,
  interest_method text, repayment_type text, loan_start_date date, first_due_date date, maturity_date date,
  monthly_due_amount numeric, term_months integer, payment_frequency text, status text, notes text,
  created_date timestamptz not null default now()
);

create table if not exists installments (
  id uuid primary key default gen_random_uuid(), loan_id uuid references loans(id) on delete cascade,
  installment_number integer, due_date date, principal_due numeric, interest_due numeric, total_due numeric,
  amount_paid numeric default 0, principal_paid numeric default 0, interest_paid numeric default 0,
  status text, paid_date date, payment_id uuid, reminder_sent_at timestamptz,
  created_date timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(), loan_id uuid references loans(id) on delete cascade,
  installment_id uuid references installments(id) on delete set null, borrower_id uuid references borrowers(id) on delete set null,
  amount numeric, payment_date date, payment_method text, transaction_reference text, proof_url text,
  verified boolean default false, verified_at timestamptz, verified_by uuid, notes text,
  created_date timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(), borrower_id uuid, loan_id uuid, activity_type text,
  description text, metadata jsonb, created_date timestamptz not null default now()
);
create table if not exists notificationlogs (
  id uuid primary key default gen_random_uuid(), borrower_id uuid, loan_id uuid, installment_id uuid,
  channel text, message_type text, message text, status text, sent_at timestamptz,
  created_date timestamptz not null default now()
);
create table if not exists paymentsettings (
  id uuid primary key default gen_random_uuid(), upi_id text, account_name text, qr_code_url text,
  created_date timestamptz not null default now()
);

alter table borrowers add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table loans add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table installments add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table payments add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table activities add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table notificationlogs add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table paymentsettings add column if not exists owner_id uuid references auth.users(id) default auth.uid();

alter table borrowers enable row level security;
alter table loans enable row level security;
alter table installments enable row level security;
alter table payments enable row level security;
alter table activities enable row level security;
alter table notificationlogs enable row level security;
alter table paymentsettings enable row level security;

drop policy if exists "authenticated users can manage lending data" on borrowers;
drop policy if exists "authenticated users can manage loans" on loans;
drop policy if exists "authenticated users can manage installments" on installments;
drop policy if exists "authenticated users can manage payments" on payments;
drop policy if exists "authenticated users can manage activities" on activities;
drop policy if exists "authenticated users can manage notifications" on notificationlogs;
drop policy if exists "authenticated users can manage payment settings" on paymentsettings;
drop policy if exists "users can manage their borrowers" on borrowers;
drop policy if exists "users can manage their loans" on loans;
drop policy if exists "users can manage their installments" on installments;
drop policy if exists "users can manage their payments" on payments;
drop policy if exists "users can manage their activities" on activities;
drop policy if exists "users can manage their notifications" on notificationlogs;
drop policy if exists "users can manage their payment settings" on paymentsettings;

create policy "users can manage their borrowers" on borrowers for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their loans" on loans for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their installments" on installments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their payments" on payments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their activities" on activities for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their notifications" on notificationlogs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users can manage their payment settings" on paymentsettings for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload payment proofs" on storage.objects;
drop policy if exists "authenticated users can update payment proofs" on storage.objects;
drop policy if exists "authenticated users can delete payment proofs" on storage.objects;

create policy "authenticated users can upload payment proofs"
on storage.objects for insert to authenticated
with check (bucket_id = 'payment-proofs');

create policy "authenticated users can update payment proofs"
on storage.objects for update to authenticated
using (bucket_id = 'payment-proofs')
with check (bucket_id = 'payment-proofs');

create policy "authenticated users can delete payment proofs"
on storage.objects for delete to authenticated
using (bucket_id = 'payment-proofs');