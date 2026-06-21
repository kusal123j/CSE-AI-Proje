import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'warning' | 'danger' | 'success';
}

const tones = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
  danger: 'border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
};

export function Alert({ tone = 'info', className, ...props }: AlertProps) {
  return <div className={cn('rounded-2xl border p-4 text-sm', tones[tone], className)} {...props} />;
}
