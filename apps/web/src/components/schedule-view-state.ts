'use client';
import { useLayoutEffect, useRef } from 'react';
import { z } from 'zod';
export const scheduleViewSchema = z.object({
  discipline: z.string().max(80),
  mode: z.enum(['timeline', 'table']),
  rows: z.enum(['tasks', 'hierarchy']).default('tasks'),
  baseline: z.boolean(),
  collapsed: z.array(z.string()).max(5000),
  closed: z.array(z.string()).max(5000),
  selected: z.string().nullable(),
  tab: z.enum(['Details', 'Evidence', 'Audit trail']),
  offset: z.number().int().min(-100000).max(100000),
  step: z.union([z.literal(1), z.literal(7)]),
});
export type ScheduleView = z.infer<typeof scheduleViewSchema>;
export const scheduleViewDefaults: ScheduleView = {
  discipline: 'All',
  mode: 'timeline',
  rows: 'tasks',
  baseline: true,
  collapsed: [],
  closed: [],
  selected: null,
  tab: 'Details',
  offset: 0,
  step: 1,
};
const positionSchema = z.object({
  y: z.number().nonnegative(),
  x: z.number().nonnegative(),
  top: z.number().nonnegative(),
  drawer: z.number().nonnegative(),
});
export function useSchedulePosition(key: string, ready: boolean) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!ready) return;
    let position = { y: 0, x: 0, top: 0, drawer: 0 };
    try {
      const stored = positionSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
      if (stored.success) position = stored.data;
    } catch {
      /* Keep the default view when storage is unavailable. */
    }
    const save = (event: Event) => {
      if (event.target === document) position.y = Math.max(0, window.scrollY);
      if (scrollArea.current && event.target === scrollArea.current) {
        position.x = Math.max(0, scrollArea.current.scrollLeft);
        position.top = Math.max(0, scrollArea.current.scrollTop);
      }
      if (dialog.current && event.target === dialog.current)
        position.drawer = Math.max(0, dialog.current.scrollTop);
      try {
        sessionStorage.setItem(key, JSON.stringify(position));
      } catch {
        /* Optional persistence. */
      }
    };
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: position.y, behavior: 'instant' });
      scrollArea.current?.scrollTo({ left: position.x, top: position.top, behavior: 'instant' });
      dialog.current?.scrollTo({ top: position.drawer, behavior: 'instant' });
      window.addEventListener('scroll', save, { capture: true, passive: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', save, true);
    };
  }, [key, ready]);
  return { scrollArea, dialog };
}
