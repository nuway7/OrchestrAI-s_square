-- 동아리 광장 DB. Supabase 대시보드 > SQL Editor에 통째로 붙여 넣고 Run.
-- 여러 번 실행해도 괜찮게 만들었다(이미 있으면 건너뛰거나 다시 만든다).
--
-- 원칙
--  * 로그인한 동아리원(authenticated)만 읽고 쓸 수 있다. 로그인 안 한 사람(anon)은 아무것도 못 본다.
--  * 글은 쓴 사람만 지울 수 있고, 관리자(role = 'admin')는 모든 글을 지울 수 있다.
--  * 자기 role을 스스로 admin으로 바꿀 수 없다(role 열은 수정 권한을 주지 않음).

-- ---------- 표 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  look jsonb not null default '{}'::jsonb,
  role text not null default 'member' check (role in ('member', 'admin')),
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  description text not null default '' check (char_length(description) <= 400),
  link text not null default '' check (link = '' or (char_length(link) <= 300 and link ~ '^https?://')),
  created_at timestamptz not null default now()
);

create table if not exists public.opinions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.opinion_likes (
  opinion_id uuid not null references public.opinions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  primary key (opinion_id, user_id)
);

create index if not exists works_created_idx on public.works (created_at desc);
create index if not exists opinions_created_idx on public.opinions (created_at desc);

-- ---------- 관리자 확인 ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- 권한 (표 단위) ----------
revoke all on public.profiles, public.works, public.opinions, public.opinion_likes from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, name, look) on public.profiles to authenticated;
grant update (name, look, updated_at) on public.profiles to authenticated;

grant select, delete on public.works to authenticated;
grant insert (title, description, link) on public.works to authenticated;

grant select, delete on public.opinions to authenticated;
grant insert (body) on public.opinions to authenticated;

grant select, delete on public.opinion_likes to authenticated;
grant insert (opinion_id) on public.opinion_likes to authenticated;

-- ---------- 행 수준 보안 (RLS) ----------
alter table public.profiles enable row level security;
alter table public.works enable row level security;
alter table public.opinions enable row level security;
alter table public.opinion_likes enable row level security;

drop policy if exists "profiles: 동아리원은 모두 볼 수 있음" on public.profiles;
drop policy if exists "profiles: 내 프로필 만들기" on public.profiles;
drop policy if exists "profiles: 내 프로필 고치기" on public.profiles;
create policy "profiles: 동아리원은 모두 볼 수 있음" on public.profiles for select to authenticated using (true);
create policy "profiles: 내 프로필 만들기" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: 내 프로필 고치기" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "works: 동아리원은 모두 볼 수 있음" on public.works;
drop policy if exists "works: 내 이름으로만 올리기" on public.works;
drop policy if exists "works: 내 글 또는 관리자만 지우기" on public.works;
create policy "works: 동아리원은 모두 볼 수 있음" on public.works for select to authenticated using (true);
create policy "works: 내 이름으로만 올리기" on public.works for insert to authenticated with check (author_id = (select auth.uid()));
create policy "works: 내 글 또는 관리자만 지우기" on public.works for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "opinions: 동아리원은 모두 볼 수 있음" on public.opinions;
drop policy if exists "opinions: 내 이름으로만 올리기" on public.opinions;
drop policy if exists "opinions: 내 글 또는 관리자만 지우기" on public.opinions;
create policy "opinions: 동아리원은 모두 볼 수 있음" on public.opinions for select to authenticated using (true);
create policy "opinions: 내 이름으로만 올리기" on public.opinions for insert to authenticated with check (author_id = (select auth.uid()));
create policy "opinions: 내 글 또는 관리자만 지우기" on public.opinions for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "likes: 동아리원은 모두 볼 수 있음" on public.opinion_likes;
drop policy if exists "likes: 내 공감만 누르기" on public.opinion_likes;
drop policy if exists "likes: 내 공감만 취소" on public.opinion_likes;
create policy "likes: 동아리원은 모두 볼 수 있음" on public.opinion_likes for select to authenticated using (true);
create policy "likes: 내 공감만 누르기" on public.opinion_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "likes: 내 공감만 취소" on public.opinion_likes for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- 실시간 광장 채널 ----------
-- 'plaza' 채널(비공개)은 로그인한 동아리원만 듣고 보낼 수 있다.
-- 대시보드 Realtime > Settings에서 "Allow public access"도 꺼야 비공개 채널만 열린다.
drop policy if exists "plaza: 동아리원만 듣기" on realtime.messages;
drop policy if exists "plaza: 동아리원만 보내기" on realtime.messages;
create policy "plaza: 동아리원만 듣기" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'plaza');
create policy "plaza: 동아리원만 보내기" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'plaza');
