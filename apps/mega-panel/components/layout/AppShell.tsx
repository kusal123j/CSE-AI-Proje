'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Sheet } from '@/components/ui/sheet';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <Sheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}>
        <Sidebar mobile onNavigate={() => setMobileNavOpen(false)} />
      </Sheet>
      <div className="min-w-0 flex-1">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
