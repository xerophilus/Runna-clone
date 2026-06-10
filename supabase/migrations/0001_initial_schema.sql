-- Cadence — initial schema (spec §4 "Data model").
--
-- Mirrors the domain model in src/core/types/domain.ts. jsonb columns hold the
-- structured sub-objects (prescription, target_volume, fitness_baseline, etc.)
-- that don't need to be queried relationally. Row Level Security is enabled so a
-- user can only ever see their own data.

-- ---------------------------------------------------------------------------
-- users (extends Supabase auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  fitness_baseline jsonb not null default '{}'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('race', 'standard', 'maintenance')),
  detail jsonb not null default '{}'::jsonb,
  goal_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  phase_structure jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'superseded')),
  version int not null default 1,
  engine_version int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists plans_user_idx on public.plans (user_id);
create index if not exists plans_goal_idx on public.plans (goal_id);

-- ---------------------------------------------------------------------------
-- weeks
-- ---------------------------------------------------------------------------
create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  week_index int not null,
  phase text not null,
  target_volume jsonb not null default '{}'::jsonb,
  is_deload boolean not null default false,
  unique (plan_id, week_index)
);
create index if not exists weeks_plan_idx on public.weeks (plan_id);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  type text not null check (type in ('run', 'strength', 'ruck', 'cross', 'rest')),
  scheduled_date date not null,
  prescription jsonb not null,
  display jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped', 'modified')),
  effort_flag text check (effort_flag in ('easy', 'ok', 'hard', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists sessions_week_idx on public.sessions (week_id);
create index if not exists sessions_plan_date_idx on public.sessions (plan_id, scheduled_date);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  source text not null check (source in ('manual', 'healthkit')),
  type text not null,
  started_at timestamptz not null,
  duration_s int not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  rpe int check (rpe between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists activities_user_idx on public.activities (user_id);
create index if not exists activities_session_idx on public.activities (session_id);

-- ---------------------------------------------------------------------------
-- adaptations
-- ---------------------------------------------------------------------------
create table if not exists public.adaptations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  triggered_at timestamptz not null default now(),
  trigger text not null check (trigger in ('missed_sessions', 'underperformance', 'manual_fatigue', 'user_request')),
  summary text,
  changes jsonb not null default '{}'::jsonb
);
create index if not exists adaptations_plan_idx on public.adaptations (plan_id);

-- ---------------------------------------------------------------------------
-- engine_config: adaptation thresholds & tunables live server-side (spec §10)
-- so they can be tuned against real usage without an app release.
-- ---------------------------------------------------------------------------
create table if not exists public.engine_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.goals enable row level security;
alter table public.plans enable row level security;
alter table public.weeks enable row level security;
alter table public.sessions enable row level security;
alter table public.activities enable row level security;
alter table public.adaptations enable row level security;

create policy "own profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own plans" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- weeks/sessions are owned transitively through their plan.
create policy "own weeks" on public.weeks
  for all using (
    exists (select 1 from public.plans p where p.id = weeks.plan_id and p.user_id = auth.uid())
  );

create policy "own sessions" on public.sessions
  for all using (
    exists (select 1 from public.plans p where p.id = sessions.plan_id and p.user_id = auth.uid())
  );

create policy "own activities" on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own adaptations" on public.adaptations
  for all using (
    exists (select 1 from public.plans p where p.id = adaptations.plan_id and p.user_id = auth.uid())
  );

-- engine_config is readable by authenticated users, writable only by service role.
alter table public.engine_config enable row level security;
create policy "read engine config" on public.engine_config for select using (true);
