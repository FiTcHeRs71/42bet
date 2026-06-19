// src/lib/paginate.ts
// Récupère TOUTES les lignes d'une requête PostgREST/Supabase en paginant.
// PostgREST plafonne chaque réponse à `max-rows` (1000 par défaut) : une requête
// `.select()` sans plage renvoie donc au plus 1000 lignes, silencieusement. Ce
// helper boucle sur `.range(from, to)` jusqu'à une page incomplète. Pur : ne
// connaît pas Supabase, il reçoit un `fetchPage` qui renvoie les lignes BRUTES
// d'une plage (la pagination doit compter les lignes brutes, jamais un résultat
// déjà filtré/normalisé — sinon arrêt prématuré). Testé dans tests/paginate.test.ts.

/**
 * Concatène toutes les pages renvoyées par `fetchPage(from, to)` (bornes
 * inclusives, façon Supabase `.range`) jusqu'à recevoir une page de moins de
 * `pageSize` lignes. `pageSize` doit valoir le `max-rows` du serveur (1000).
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
    from += pageSize;
  }
}
