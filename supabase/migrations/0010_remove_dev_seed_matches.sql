-- supabase/migrations/0010_remove_dev_seed_matches.sql
-- Retire les fixtures de dev factices (0008_seed_matches.sql, ids 900001–900007)
-- maintenant que l'ingestion réelle (cron sync-matches) insère les vrais matchs.
-- Cascade sur d'éventuels bets de dev posés dessus (bets.match_id on delete cascade).

delete from public.matches
 where football_data_id between 900001 and 900007;
