'use client';
import { useLayoutEffect, useEffect, useState } from 'react';
import type { z } from 'zod';

// Store view preferences only. The server remains the source for permissions and project data.
export function useSessionView<T>(key: string, schema: z.ZodType<T>, defaults: T) {
  const [view, setView] = useState(defaults);
  const [loadedKey, setLoadedKey] = useState('');
  useLayoutEffect(() => {
    let restored = defaults;
    try {
      const parsed = schema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
      if (parsed.success) restored = parsed.data;
    } catch {
      /* Storage can be unavailable; the view still works in memory. */
    }
    setView(restored);
    setLoadedKey(key);
  }, [key, schema, defaults]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(view));
    } catch {
      /* Optional persistence. */
    }
  }, [key, loadedKey, view]);
  return { view, setView, ready: loadedKey === key };
}
