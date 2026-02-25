'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/auth';
import type { AppRole } from '@/lib/api-auth';

function resolveRole(sessionRole?: unknown, userRole?: unknown): AppRole {
  if (sessionRole === 'owner' || sessionRole === 'manager' || sessionRole === 'staff') {
    return sessionRole;
  }
  if (userRole === 'owner' || userRole === 'manager' || userRole === 'staff') {
    return userRole;
  }
  return 'staff';
}

export function useRouteGuard(
  allowedRoles: AppRole[],
  options?: { unauthorizedRedirect?: string }
) {
  const router = useRouter();
  const pathname = usePathname();
  const allowedRolesKey = allowedRoles.join('|');
  const unauthorizedRedirect = options?.unauthorizedRedirect ?? '/';
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data.session;

      if (error || !session?.access_token || !session.user) {
        if (mounted) {
          setIsAuthorized(false);
          setIsChecking(false);
        }
        router.replace(`/auth?next=${encodeURIComponent(pathname || '/')}`);
        return;
      }

      const resolvedRole = resolveRole(session.user.app_metadata?.role, session.user.user_metadata?.role);
      if (!allowedRolesKey.split('|').includes(resolvedRole)) {
        if (mounted) {
          setRole(resolvedRole);
          setIsAuthorized(false);
          setIsChecking(false);
        }
        router.replace(unauthorizedRedirect);
        return;
      }

      if (mounted) {
        setRole(resolvedRole);
        setIsAuthorized(true);
        setIsChecking(false);
      }
    };

    verify();

    return () => {
      mounted = false;
    };
  }, [allowedRolesKey, pathname, router, unauthorizedRedirect]);

  return { isChecking, isAuthorized, role };
}
