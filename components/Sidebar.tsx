 'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AppRole } from '@/lib/api-auth';
import { signOut } from '@/lib/auth';

type SidebarProps = {
  role?: AppRole | null;
};

type NavItem = {
  href: string;
  label: string;
  roles?: AppRole[];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['staff', 'manager', 'owner'] },
  { href: '/employee', label: 'POS', roles: ['staff', 'manager', 'owner'] },
  { href: '/reports', label: 'Reports', roles: ['manager', 'owner'] },
  { href: '/inventory', label: 'Inventory', roles: ['manager', 'owner'] },
  { href: '/owner/audit', label: 'Audit Logs', roles: ['owner'] },
];

function canView(item: NavItem, role?: AppRole | null): boolean {
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace('/auth');
      setIsSigningOut(false);
    }
  };

  return (
    <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col max-h-screen overflow-y-auto shadow-sm">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Bar Logic</p>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Control Panel</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {NAV_ITEMS.filter((item) => canView(item, role)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center px-4 py-3 rounded-xl transition text-sm font-semibold ${
              pathname === item.href
                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                : 'text-slate-700 hover:bg-slate-100 border border-transparent'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-200 pt-4 mt-6">
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={isSigningOut}
          className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400 font-semibold transition"
        >
          {isSigningOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </aside>
  );
}
