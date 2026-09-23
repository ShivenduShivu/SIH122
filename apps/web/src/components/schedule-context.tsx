'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ScheduleSnapshot } from '@nirmaan/contracts/reports';
const Context = createContext<{
  snapshot: ScheduleSnapshot;
  refresh: () => Promise<void>;
  stale: boolean;
} | null>(null);
export function ScheduleProvider({
  initial,
  children,
}: {
  initial: ScheduleSnapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [stale, setStale] = useState(false);
  useEffect(() => {
    setSnapshot((current) =>
      current.projectId !== initial.projectId || initial.scheduleVersion >= current.scheduleVersion
        ? initial
        : current,
    );
  }, [initial]);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/projects/${initial.projectId}/schedule`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const next = ScheduleSnapshot.parse(await response.json());
      setSnapshot((current) =>
        next.projectId === current.projectId && next.scheduleVersion >= current.scheduleVersion
          ? next
          : current,
      );
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [initial.projectId]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ snapshot, refresh, stale }}>
      {stale && (
        <p role="alert" className="validation-notice">
          Connection interrupted. Showing the last confirmed schedule.{' '}
          <button className="button" onClick={() => void refresh()}>
            Retry refresh
          </button>
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
export function useSchedule() {
  const c = useContext(Context);
  if (!c) throw new Error('Schedule context missing');
  return c;
}
