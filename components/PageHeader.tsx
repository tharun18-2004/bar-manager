'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppRole } from '@/lib/api-auth';
import { getCurrentUser } from '@/lib/auth';

type PageHeaderProps = {
  title: string;
  role?: AppRole | null;
};

export default function PageHeader({ title, role }: PageHeaderProps) {
  const [userName, setUserName] = useState('User');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!mounted) return;
      const fullName = user?.user_metadata?.full_name;
      setUserName(typeof fullName === 'string' && fullName.trim().length > 0 ? fullName : user?.email ?? 'User');
    };

    void loadUser();

    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const roleLabel = useMemo(() => {
    if (!role) return 'Staff';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [role]);

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500">Modern bar operations console</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700">
          {roleLabel}
        </span>
        <span className="px-3 py-1 rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
          {userName}
        </span>
        <span className="px-3 py-1 rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
          {clock.toLocaleString()}
        </span>
      </div>
    </header>
  );
}
