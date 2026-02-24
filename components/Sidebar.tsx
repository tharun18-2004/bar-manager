import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '@/lib/api-auth';

type SidebarProps = {
  role?: AppRole | null;
};

type NavItem = {
  href: string;
  label: string;
  roles?: AppRole[];
};

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Main',
    items: [
      { href: '/', label: 'Home' },
      { href: '/auth', label: 'Sign In' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/employee', label: 'POS System', roles: ['staff', 'manager', 'owner'] },
      { href: '/tables', label: 'Tables', roles: ['staff', 'manager', 'owner'] },
      { href: '/customers', label: 'Customers', roles: ['manager', 'owner'] },
    ],
  },
  {
    title: 'Management',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['manager', 'owner'] },
      { href: '/staff', label: 'Staff', roles: ['owner'] },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { href: '/reports', label: 'Reports', roles: ['manager', 'owner'] },
      { href: '/owner', label: 'Owner Dashboard', roles: ['owner'] },
      { href: '/owner/audit', label: 'Owner Audit', roles: ['owner'] },
    ],
  },
];

function canView(item: NavItem, role?: AppRole | null): boolean {
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 border-r border-slate-800 p-6 flex flex-col max-h-screen overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-amber-400">BAR-LOGIC</h1>
        <p className="text-slate-400 text-xs uppercase mt-1 tracking-wider">Pro Management</p>
      </div>

      <nav className="flex-1 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => canView(item, role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="text-xs uppercase text-slate-500 font-bold mb-3 px-4">{section.title}</p>
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition text-sm font-medium ${
                      pathname === item.href
                        ? 'bg-amber-500/15 border border-amber-400/30 text-amber-200'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 pt-4 mt-6">
        <p className="text-slate-400 text-xs text-center">v2.0.0</p>
        <p className="text-slate-500 text-xs text-center mt-1">Copyright 2026 Bar Logic</p>
      </div>
    </div>
  );
}
