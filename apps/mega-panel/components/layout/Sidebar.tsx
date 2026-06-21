'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '▣' },
  { href: '/cse-import', label: 'CSE Import Control', icon: '⟳' },
  { href: '/fetch-runs', label: 'Fetch Runs', icon: '≡' },
  { href: '/companies', label: 'Companies', icon: '🏢' },
  { href: '/securities', label: 'Securities', icon: '◇' },
  { href: '/daily-snapshots', label: 'Daily Snapshots', icon: '◷' },
  { href: '/market-analytics', label: 'Market Analytics', icon: '▰' },
  { href: '/raw-logs', label: 'Raw Data / Logs', icon: '⌁' },
  { href: '/ai-playground', label: 'AI Playground', icon: '✦' }
];

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className={cn('w-72 shrink-0 border-r border-border bg-card/80 px-4 py-5 backdrop-blur', mobile ? 'block border-r-0 bg-transparent p-0' : 'hidden lg:block')}>
      <div className="mb-8 rounded-2xl border border-border bg-background/60 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Internal</div>
        <div className="mt-2 text-lg font-bold text-foreground">CSE Mega Panel</div>
        <p className="mt-1 text-xs text-muted-foreground">Founder/developer command center</p>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
