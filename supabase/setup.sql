-- Выполните один раз в Supabase: SQL Editor → New query → Run
create table if not exists public.user_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;
grant select, insert, update, delete on table public.user_data to authenticated;

drop policy if exists "read own" on public.user_data;
drop policy if exists "insert own" on public.user_data;
drop policy if exists "update own" on public.user_data;
drop policy if exists "delete own" on public.user_data;

create policy "read own" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);
