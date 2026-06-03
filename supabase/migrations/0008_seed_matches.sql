-- supabase/migrations/0008_seed_matches.sql
-- SEED DEV uniquement. Fixtures d'exemple pour développer la page /matches
-- avant l'ingestion réelle depuis football-data.org (brique séparée).
-- football_data_id = placeholders 9000xx (PAS de vrais ids API). À remplacer/
-- nettoyer quand l'ingestion réelle insérera les vrais matchs.

insert into public.matches
  (football_data_id, home_team, away_team, stage, kickoff_at, status, home_score, away_score)
values
  (900001, 'France',    'Croatie',   'Phase de groupes', '2026-06-01T18:00:00Z', 'finished',  2, 1),
  (900002, 'Brésil',    'Argentine', 'Phase de groupes', '2026-06-01T21:00:00Z', 'finished',  1, 1),
  (900003, 'Allemagne', 'Espagne',   'Phase de groupes', '2026-06-11T16:00:00Z', 'scheduled', null, null),
  (900004, 'Portugal',  'Pays-Bas',  'Phase de groupes', '2026-06-11T19:00:00Z', 'scheduled', null, null),
  (900005, 'Angleterre','Belgique',  'Phase de groupes', '2026-06-12T16:00:00Z', 'scheduled', null, null),
  (900006, 'Italie',    'Suisse',    'Phase de groupes', '2026-06-12T19:00:00Z', 'scheduled', null, null),
  (900007, 'Maroc',     'Sénégal',   'Phase de groupes', '2026-06-13T16:00:00Z', 'scheduled', null, null)
on conflict (football_data_id) do nothing;
