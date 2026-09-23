'use client';
import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
export function RefreshPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => {
    refreshing.current = pending;
  }, [pending]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || refreshing.current) return;
      refreshing.current = true;
      startTransition(() => router.refresh());
    };
    const id = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [router]);
  return null;
}
