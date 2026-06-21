'use client';

import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

export function Sheet({ open, onClose, children, side = 'left', className }: SheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default bg-black/50" aria-label="Close navigation menu" type="button" onClick={onClose} />
      <div
        className={cn(
          'absolute top-0 h-full w-80 max-w-[85vw] overflow-y-auto border-border bg-card p-4 shadow-2xl',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
