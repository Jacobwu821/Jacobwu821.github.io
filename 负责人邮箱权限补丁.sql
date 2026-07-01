-- 在 Supabase SQL Editor 中执行一次。
-- 不修改 profiles / devices 表结构，只收紧 devices 的 RLS 策略。

create or replace function public.is_approved_email(target_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where status = 'approved'
      and lower(email) = lower(trim(target_email))
  );
$$;

drop policy if exists "editor can write" on public.devices;
drop policy if exists "owner can insert" on public.devices;
drop policy if exists "owner can update" on public.devices;
drop policy if exists "owner can delete" on public.devices;

create policy "owner can insert"
on public.devices for insert
with check (
  (id = '__categories__' and public.is_admin())
  or (
    id <> '__categories__'
    and public.is_approved_email(data #>> '{contact,email}')
    and (
      public.is_admin()
      or (
        public.is_editor()
        and lower(data #>> '{contact,email}') = lower(auth.jwt() ->> 'email')
      )
    )
  )
);

create policy "owner can update"
on public.devices for update
using (
  public.is_admin()
  or (
    id <> '__categories__'
    and public.is_editor()
    and lower(data #>> '{contact,email}') = lower(auth.jwt() ->> 'email')
  )
)
with check (
  (id = '__categories__' and public.is_admin())
  or (
    id <> '__categories__'
    and public.is_approved_email(data #>> '{contact,email}')
    and (
      public.is_admin()
      or (
        public.is_editor()
        and lower(data #>> '{contact,email}') = lower(auth.jwt() ->> 'email')
      )
    )
  )
);

create policy "owner can delete"
on public.devices for delete
using (
  public.is_admin()
  or (
    id <> '__categories__'
    and public.is_editor()
    and lower(data #>> '{contact,email}') = lower(auth.jwt() ->> 'email')
  )
);
