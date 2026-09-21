-- SciRender v2.0 — Supabase PostgreSQL security schema v1
-- Execute this file in the Supabase SQL Editor with a project database owner role.
-- The migration is deliberately written so application users cannot promote
-- themselves from student to admin through the profiles UPDATE policy.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid references auth.users (id) on delete cascade primary key,
  full_name text,
  university text not null default 'Đại học Bách Khoa - ĐHQG-HCM',
  faculty text,
  major text,
  academic_year text,
  student_id text,
  birth_year integer,
  hometown text,
  role text not null default 'student' check (role in ('student', 'admin')),
  auto_fill_cover boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles (id) on delete cascade not null,
  title text default 'Tài liệu không tên',
  content jsonb not null default '{}'::jsonb,
  template_id text default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx
  on public.documents (user_id);

create index if not exists documents_user_id_updated_at_idx
  on public.documents (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Timestamp maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row
execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helper for admin checks
-- ---------------------------------------------------------------------------
-- This function is placed in a non-exposed schema and pins search_path to an
-- empty value. The policy must not query public.profiles directly because that
-- would recursively invoke the profiles RLS policy.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where public.profiles.id = (select auth.uid())
      and public.profiles.role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic profile creation after Supabase Auth signup
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required because the authenticated signup session must
-- be able to create its profile even though normal clients have no INSERT
-- policy on public.profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.documents enable row level security;

-- Do not grant the anonymous role direct table privileges.
revoke all on table public.profiles from anon;
revoke all on table public.documents from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- profiles policies
-- ---------------------------------------------------------------------------

-- A signed-in user can read their own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
as permissive
for select
to authenticated
using ((select auth.uid()) = id);

-- An administrator can read every profile.
-- private.is_admin() is SECURITY DEFINER specifically to avoid RLS recursion.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles
as permissive
for select
to authenticated
using ((select private.is_admin()));

-- A signed-in user can update only their own profile.
-- The WITH CHECK clause deliberately prevents a student from changing their
-- own role to admin. An existing administrator may retain or change their role.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
as permissive
for update
to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and (
    role = 'student'
    or (select private.is_admin())
  )
);

-- There is intentionally no INSERT or DELETE policy for profiles.
-- Profile creation is performed only by the auth.users trigger above.

-- ---------------------------------------------------------------------------
-- documents policies
-- ---------------------------------------------------------------------------

-- A user can read only their own documents.
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
on public.documents
as permissive
for select
to authenticated
using ((select auth.uid()) = user_id);

-- A user can create a document only when user_id points to their own account.
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
as permissive
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- A user can update only their own documents, and cannot transfer ownership
-- of an existing document to another account.
drop policy if exists documents_update_own on public.documents;
create policy documents_update_own
on public.documents
as permissive
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- A user can delete only their own documents.
drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own
on public.documents
as permissive
for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
