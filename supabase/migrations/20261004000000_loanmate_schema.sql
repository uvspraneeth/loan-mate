-- LoanMate schema. Idempotent: safe on a fresh project and on an existing one.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
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

-- Columns used by the app that the original schema was missing
alter table paymentsettings add column if not exists bank_account_name text;
alter table paymentsettings add column if not exists bank_account_number text;
alter table paymentsettings add column if not exists bank_ifsc text;
alter table paymentsettings add column if not exists payment_link text;
alter table paymentsettings add column if not exists reminder_7_days boolean not null default true;
alter table paymentsettings add column if not exists reminder_3_days boolean not null default true;
alter table paymentsettings add column if not exists reminder_1_day boolean not null default true;
alter table paymentsettings add column if not exists reminder_on_due boolean not null default true;
alter table paymentsettings add column if not exists reminder_after_overdue boolean not null default true;

alter table payments add column if not exists rejected_at timestamptz;

-- ---------------------------------------------------------------- ownership
alter table borrowers add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table loans add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table installments add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table payments add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table activities add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table notificationlogs add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table paymentsettings add column if not exists owner_id uuid references auth.users(id) default auth.uid();

-- ---------------------------------------------------------------- indexes
-- An earlier bug reused loan numbers; suffix duplicates (LN-1002 → LN-1002-2) so the
-- unique index can be created. The oldest loan keeps the original number.
with ranked as (
  select id, loan_number,
         row_number() over (partition by owner_id, loan_number order by created_date, id) as rn
  from loans
  where loan_number is not null
)
update loans l
set loan_number = r.loan_number || '-' || r.rn
from ranked r
where l.id = r.id and r.rn > 1;

create unique index if not exists loans_owner_loan_number_key on loans (owner_id, loan_number);
create index if not exists borrowers_owner_id_idx on borrowers (owner_id);
create index if not exists loans_owner_id_idx on loans (owner_id);
create index if not exists loans_borrower_id_idx on loans (borrower_id);
create index if not exists installments_owner_id_idx on installments (owner_id);
create index if not exists installments_loan_id_idx on installments (loan_id);
create index if not exists payments_owner_id_idx on payments (owner_id);
create index if not exists payments_loan_id_idx on payments (loan_id);
create index if not exists payments_installment_id_idx on payments (installment_id);
create index if not exists activities_owner_id_idx on activities (owner_id);
create index if not exists notificationlogs_owner_id_idx on notificationlogs (owner_id);
create index if not exists paymentsettings_owner_id_idx on paymentsettings (owner_id);

-- ---------------------------------------------------------------- access
grant usage on schema public to authenticated;
grant select, insert, update, delete on borrowers, loans, installments, payments, activities, notificationlogs, paymentsettings to authenticated;

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

create policy "users can manage their borrowers" on borrowers for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their loans" on loans for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their installments" on installments for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their payments" on payments for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their activities" on activities for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their notifications" on notificationlogs for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users can manage their payment settings" on paymentsettings for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- realtime
-- The app subscribes to postgres_changes on these tables; they must be in the publication.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['borrowers', 'loans', 'installments', 'payments', 'activities', 'notificationlogs', 'paymentsettings'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- storage
-- Public bucket (proof URLs are unguessable), but uploads/changes are limited to
-- the uploader's own "<user id>/" folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', true, 10485760, array['image/*', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can upload payment proofs" on storage.objects;
drop policy if exists "authenticated users can update payment proofs" on storage.objects;
drop policy if exists "authenticated users can delete payment proofs" on storage.objects;
drop policy if exists "users can upload their payment proofs" on storage.objects;
drop policy if exists "users can update their payment proofs" on storage.objects;
drop policy if exists "users can delete their payment proofs" on storage.objects;

create policy "users can upload their payment proofs"
on storage.objects for insert to authenticated
with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users can update their payment proofs"
on storage.objects for update to authenticated
using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users can delete their payment proofs"
on storage.objects for delete to authenticated
using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
