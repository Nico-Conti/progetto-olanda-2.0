-- Aggiungi colonne per statistiche extra
alter table public.matches 
  add column if not exists home_goals int default 0,
  add column if not exists away_goals int default 0,
  add column if not exists home_shots int,
  add column if not exists away_shots int,
  add column if not exists home_shots_on_target int,
  add column if not exists away_shots_on_target int,
  add column if not exists home_possession int, -- Percentuale (es. 55)
  add column if not exists away_possession int,
  add column if not exists home_yellow_cards int,
  add column if not exists away_yellow_cards int,
  add column if not exists home_red_cards int,
  add column if not exists away_red_cards int,
  add column if not exists home_fouls int,
  add column if not exists away_fouls int;
