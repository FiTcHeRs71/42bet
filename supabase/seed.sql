-- supabase/seed.sql
-- Seed de DEV uniquement (joué par `supabase db reset`, jamais en prod).
-- 6 coalitions réelles de Lausanne (campus 47) + joueurs fictifs `test_*`
-- répartis sur plusieurs coalitions, avec des bets notés pour peupler le classement.
-- Données vérifiées via l'API 42 le 2026-06-07.

-- 1. Coalitions réelles (cursus 21 = Houses, cursus 9 = Piscine).
insert into public.coalitions (ft_id, name, color, image_url) values
  (193, 'House of Processes', '#70AF85', 'https://cdn.intra.42.fr/coalition/image/193/final-processes-black-12.svg'),
  (192, 'House of Threads',   '#599ac2', 'https://cdn.intra.42.fr/coalition/image/192/final-threads-black.svg'),
  (191, 'House of Cores',     '#B23256', 'https://cdn.intra.42.fr/coalition/image/191/final-cores-black3.svg'),
  (168, 'The Sharks',         '#82CCE0', 'https://cdn.intra.42.fr/coalition/image/168/7.svg'),
  (167, 'The Frogs',          '#6c8946', 'https://cdn.intra.42.fr/coalition/image/167/5.svg'),
  (166, 'The Penguins',       '#EAB77F', 'https://cdn.intra.42.fr/coalition/image/166/8.svg')
on conflict (ft_id) do nothing;

-- 2. Joueurs fictifs, total_points dénormalisé cohérent avec les bets ci-dessous.
insert into public.users (ft_id, login, avatar_url, coalition_id, total_points)
select v.ft_id, v.login, null, c.id, v.total_points
from (values
  (900001, 'test_proc_a', 193, 9),
  (900002, 'test_proc_b', 193, 4),
  (900003, 'test_threads_a', 192, 7),
  (900004, 'test_threads_b', 192, 3),
  (900005, 'test_cores_a', 191, 6),
  (900006, 'test_cores_b', 191, 1),
  (900007, 'test_shark_a', 168, 8),
  (900008, 'test_shark_b', 168, 2),
  (900009, 'test_frog_a', 167, 5),
  (900010, 'test_penguin_a', 166, 3),
  (900011, 'test_nocoa', null, 0)
) as v(ft_id, login, coa_ft_id, total_points)
left join public.coalitions c on c.ft_id = v.coa_ft_id
on conflict (ft_id) do nothing;

-- 3. Match de test TERMINÉ pour accrocher les bets. Nécessaire car la migration
--    0010 vide les matchs de dev : sans ce match, le bloc bets serait un no-op et
--    le classement resterait vide. football_data_id 999001 = plage de test dédiée.
insert into public.matches
  (football_data_id, home_team, away_team, stage, kickoff_at, status, home_score, away_score)
values
  (999001, 'Test FC', 'Seed United', 'group', now() - interval '1 day', 'finished', 2, 1)
on conflict (football_data_id) do nothing;

-- 4. Bets fictifs notés, accrochés au match de test ci-dessus.
--    Chaque joueur a 2 pronos ; points_awarded varié pour exercer accuracy.
with m as (select id from public.matches where football_data_id = 999001)
insert into public.bets (user_id, match_id, home_score, away_score, points_awarded)
select u.id, m.id, b.home, b.away, b.pts
from m
cross join (values
  (900001, 2, 1, 3), (900001, 1, 1, 1),
  (900002, 0, 0, 1), (900002, 3, 0, 0),
  (900003, 2, 2, 3), (900003, 1, 0, 1),
  (900004, 1, 1, 3), (900004, 0, 2, 0),
  (900005, 2, 0, 3), (900005, 1, 1, 1),
  (900006, 0, 1, 1), (900006, 2, 2, 0),
  (900007, 3, 1, 3), (900007, 1, 1, 1),
  (900008, 0, 0, 1), (900008, 2, 1, 0),
  (900009, 1, 2, 3), (900009, 0, 0, 1),
  (900010, 2, 1, 3), (900010, 1, 1, 0)
) as b(ft_id, home, away, pts)
join public.users u on u.ft_id = b.ft_id
on conflict (user_id, match_id) do nothing;
