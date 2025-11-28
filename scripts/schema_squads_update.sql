-- Aggiungi colonne per info extra da TheSportsDB
alter table public.squads 
  add column if not exists stadium_image_url text,
  add column if not exists description text,
  add column if not exists formed_year int,
  add column if not exists website text;
