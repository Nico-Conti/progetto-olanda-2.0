-- 1. Crea la tabella squads
create table public.squads (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  logo_url text, -- Opzionale: URL del logo
  stats jsonb default '{}'::jsonb, -- Campo flessibile per le statistiche
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Aggiungi le colonne per le chiavi esterne alla tabella matches
alter table public.matches 
  add column home_team_id uuid references public.squads(id),
  add column away_team_id uuid references public.squads(id);

-- ISTRUZIONI:
-- 1. Esegui questo SQL nell'editor di Supabase.
-- 2. Esegui lo script Python `migrate_teams.py` (che creerò a breve) per popolare la tabella squads e aggiornare matches.
-- 3. Una volta completata la migrazione, puoi rimuovere le vecchie colonne di testo (opzionale ma consigliato):
-- alter table public.matches drop column home_team;
-- alter table public.matches drop column away_team;
