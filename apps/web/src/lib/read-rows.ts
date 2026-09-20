// Stable-key paging for evidence registers. Accepted schedule projections use the single SQL snapshot.
export async function readRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | undefined;
  for (let from = 0; from < 10000; from += 200) {
    const result = await page(from, from + 199);
    if (result.error || result.count === null)
      throw new Error('Could not load the complete evidence register.');
    if (expected !== undefined && result.count !== expected)
      throw new Error('Evidence changed while loading. Please refresh.');
    expected = result.count;
    rows.push(...(result.data ?? []));
    if (rows.length === expected) return rows;
    if (!result.data?.length) break;
  }
  throw new Error('Evidence register needs a narrower query. No partial result was shown.');
}
