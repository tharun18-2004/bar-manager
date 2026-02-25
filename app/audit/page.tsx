'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRouteGuard } from '@/lib/route-guard';

export default function AuditRedirectPage() {
  const router = useRouter();
  const { isChecking, isAuthorized } = useRouteGuard(['owner'], { unauthorizedRedirect: '/dashboard' });

  useEffect(() => {
    if (!isAuthorized) return;
    router.replace('/owner/audit');
  }, [isAuthorized, router]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  return null;
}
