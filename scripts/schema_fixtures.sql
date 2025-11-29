-- Create fixtures table
create table public.fixtures (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  home_team text not null,
  away_team text not null,
  match_date timestamp with time zone not null,
  giornata integer not null,
  status text default 'SCHEDULED', -- 'SCHEDULED', 'FINISHED', 'POSTPONED'
  
  -- Prediction columns
  prediction_home_corners float,
  prediction_away_corners float,
  prediction_total_corners float,
  prediction_prob_over_9_5 float,
  
  -- Constraint to avoid duplicates
  unique(home_team, away_team, match_date)
);

-- Enable RLS
alter table public.fixtures enable row level security;

-- Create policy to allow public read access
create policy "Public fixtures are viewable by everyone"
  on public.fixtures for select
  using ( true );

-- Create policy to allow service role full access (for scraper)
create policy "Service role has full access"
  on public.fixtures for all
  using ( true )
  with check ( true );
