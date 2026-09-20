'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export function RefreshPage() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
