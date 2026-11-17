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

-- 작업실 방 번호 (1~5, 한 방에 한 명). 예전 버전 DB에도 열만 더한다.
alter table public.profiles add column if not exists room smallint unique check (room between 1 and 5);

grant select on public.profiles to authenticated;
grant insert (id, name, look, room) on public.profiles to authenticated;
grant update (name, look, room, updated_at) on public.profiles to authenticated;

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

-- =====================================================================
-- 2차: 작업실 노트북(안건), 방문 잔디, 일정, 광장 설정(D-day, 두레 링크)
-- =====================================================================

-- ---------- 안건과 의견 (작업실 노트북) ----------
create table if not exists public.agendas (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.agenda_comments (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references public.agendas (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists agenda_comments_agenda_idx on public.agenda_comments (agenda_id, created_at);

-- ---------- 방문 잔디 (하루 10분 이상 머문 날) ----------
create table if not exists public.visits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
-- 날짜는 서버가 한국 시간으로 정한다(직접 넣기 권한은 주지 않고 이 함수로만)
create or replace function public.mark_visit()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.visits (user_id, day)
  values (auth.uid(), (now() at time zone 'Asia/Seoul')::date)
  on conflict do nothing;
$$;
revoke all on function public.mark_visit() from public, anon;
grant execute on function public.mark_visit() to authenticated;

-- ---------- 일정과 참석 ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  starts_at timestamptz not null,
  place text not null default '' check (char_length(place) <= 60),
  created_at timestamptz not null default now()
);
create table if not exists public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'no')),
  primary key (event_id, user_id)
);

-- ---------- 광장 설정 (관리자만 바꿈) ----------
create table if not exists public.club_settings (
  key text primary key check (key in ('dday', 'links')),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.club_settings (key, value) values
  ('dday', '{"title": "두레 런칭", "date": "2026-12-31T00:00:00+09:00"}'),
  ('links', '{"site": "", "github": ""}')
on conflict (key) do nothing;

-- ---------- 권한 ----------
revoke all on public.agendas, public.agenda_comments, public.visits, public.events, public.event_rsvps, public.club_settings from anon, authenticated;

grant select, delete on public.agendas to authenticated;
grant insert (title, body) on public.agendas to authenticated;
grant select, delete on public.agenda_comments to authenticated;
grant insert (agenda_id, body) on public.agenda_comments to authenticated;
grant select on public.visits to authenticated;
grant select, delete on public.events to authenticated;
grant insert (title, starts_at, place) on public.events to authenticated;
grant select, delete on public.event_rsvps to authenticated;
grant insert (event_id, status) on public.event_rsvps to authenticated;
grant update (status) on public.event_rsvps to authenticated;
grant select on public.club_settings to authenticated;
grant update (value, updated_at) on public.club_settings to authenticated;

alter table public.agendas enable row level security;
alter table public.agenda_comments enable row level security;
alter table public.visits enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.club_settings enable row level security;

drop policy if exists "agendas: 동아리원은 모두 볼 수 있음" on public.agendas;
drop policy if exists "agendas: 내 이름으로만 올리기" on public.agendas;
drop policy if exists "agendas: 내 글 또는 관리자만 지우기" on public.agendas;
create policy "agendas: 동아리원은 모두 볼 수 있음" on public.agendas for select to authenticated using (true);
create policy "agendas: 내 이름으로만 올리기" on public.agendas for insert to authenticated with check (author_id = (select auth.uid()));
create policy "agendas: 내 글 또는 관리자만 지우기" on public.agendas for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "agenda_comments: 동아리원은 모두 볼 수 있음" on public.agenda_comments;
drop policy if exists "agenda_comments: 내 이름으로만 올리기" on public.agenda_comments;
drop policy if exists "agenda_comments: 내 글 또는 관리자만 지우기" on public.agenda_comments;
create policy "agenda_comments: 동아리원은 모두 볼 수 있음" on public.agenda_comments for select to authenticated using (true);
create policy "agenda_comments: 내 이름으로만 올리기" on public.agenda_comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy "agenda_comments: 내 글 또는 관리자만 지우기" on public.agenda_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "visits: 동아리원은 모두 볼 수 있음" on public.visits;
create policy "visits: 동아리원은 모두 볼 수 있음" on public.visits for select to authenticated using (true);

drop policy if exists "events: 동아리원은 모두 볼 수 있음" on public.events;
drop policy if exists "events: 내 이름으로만 올리기" on public.events;
drop policy if exists "events: 내 글 또는 관리자만 지우기" on public.events;
create policy "events: 동아리원은 모두 볼 수 있음" on public.events for select to authenticated using (true);
create policy "events: 내 이름으로만 올리기" on public.events for insert to authenticated with check (author_id = (select auth.uid()));
create policy "events: 내 글 또는 관리자만 지우기" on public.events for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "rsvps: 동아리원은 모두 볼 수 있음" on public.event_rsvps;
drop policy if exists "rsvps: 내 참석만 정하기" on public.event_rsvps;
drop policy if exists "rsvps: 내 참석만 바꾸기" on public.event_rsvps;
drop policy if exists "rsvps: 내 참석만 취소" on public.event_rsvps;
create policy "rsvps: 동아리원은 모두 볼 수 있음" on public.event_rsvps for select to authenticated using (true);
create policy "rsvps: 내 참석만 정하기" on public.event_rsvps for insert to authenticated with check (user_id = (select auth.uid()));
create policy "rsvps: 내 참석만 바꾸기" on public.event_rsvps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "rsvps: 내 참석만 취소" on public.event_rsvps for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "settings: 동아리원은 모두 볼 수 있음" on public.club_settings;
drop policy if exists "settings: 관리자만 바꾸기" on public.club_settings;
create policy "settings: 동아리원은 모두 볼 수 있음" on public.club_settings for select to authenticated using (true);
create policy "settings: 관리자만 바꾸기" on public.club_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
