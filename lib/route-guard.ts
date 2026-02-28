'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/auth';
import type { AppRole } from '@/lib/api-auth';

function resolveRole(sessionRole?: unknown, userRole?: unknown): AppRole {
  if (sessionRole === 'owner' || sessionRole === 'staff') {
    return sessionRole;
  }
  if (userRole === 'owner' || userRole === 'staff') {
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

      const fallbackRole = resolveRole(session.user.app_metadata?.role, session.user.user_metadata?.role);
      let resolvedRole = fallbackRole;
      try {
        const authContextRes = await fetch('/api/auth-context', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'x-request-id': crypto.randomUUID(),
          },
        });
        if (authContextRes.status === 403) {
          await supabase.auth.signOut();
          if (mounted) {
            setRole(null);
            setIsAuthorized(false);
            setIsChecking(false);
          }
          router.replace(`/auth?next=${encodeURIComponent(pathname || '/')}`);
          return;
        }
        if (authContextRes.ok) {
          const payload = await authContextRes.json();
          const roleFromApi = payload?.data?.role;
          if (roleFromApi === 'owner' || roleFromApi === 'staff') {
            resolvedRole = roleFromApi;
          }
        }
      } catch {
        resolvedRole = fallbackRole;
      }

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
