import { describe, test, expect } from "vitest";

import { fetchAllRows } from "../src/lib/paginate";

/**
 * Simule PostgREST : chaque réponse est plafonnée à `pageSize` lignes, quelle
 * que soit la largeur de la plage demandée (la cause du bug d'origine).
 */
function pager(total: number, pageSize: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return rows.slice(from, Math.min(to + 1, from + pageSize));
  };
  return { fetchPage, calls };
}

describe("fetchAllRows", () => {
  test("récupère TOUTES les lignes au-delà d'une page (1627 > 1000)", async () => {
    const { fetchPage, calls } = pager(1627, 1000);
    const all = await fetchAllRows(fetchPage, 1000);
    expect(all.length).toBe(1627);
    expect(all[0]).toBe(0);
    expect(all[1626]).toBe(1626);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  test("une seule page quand total < pageSize", async () => {
    const { fetchPage, calls } = pager(500, 1000);
    const all = await fetchAllRows(fetchPage, 1000);
    expect(all.length).toBe(500);
    expect(calls).toEqual([[0, 999]]);
  });

  test("multiple exact → page vide finale puis arrêt", async () => {
    const { fetchPage, calls } = pager(2000, 1000);
    const all = await fetchAllRows(fetchPage, 1000);
    expect(all.length).toBe(2000);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  test("source vide → []", async () => {
    const { fetchPage, calls } = pager(0, 1000);
    const all = await fetchAllRows(fetchPage, 1000);
    expect(all).toEqual([]);
    expect(calls).toEqual([[0, 999]]);
  });
});
