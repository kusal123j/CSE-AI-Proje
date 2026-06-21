import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'info';
}

const tones = {
  default: 'border-border bg-muted text-foreground',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  muted: 'border-border bg-muted text-muted-foreground',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
};

export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', tones[tone], className)} {...props} />;
}
