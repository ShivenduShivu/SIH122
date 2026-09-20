export async function readComplete<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | undefined;
  for (let from = 0; from < 50000; from += 200) {
    const r = await page(from, from + 199);
    if (r.error || r.count === null || (expected !== undefined && r.count !== expected))
      throw new Error('Catalogue changed or incomplete; retry.');
    expected = r.count;
    rows.push(...(r.data ?? []));
    if (rows.length === expected) return rows;
    if (!r.data?.length) break;
  }
  throw new Error('Catalogue exceeds the supported read limit; no partial result used.');
}
