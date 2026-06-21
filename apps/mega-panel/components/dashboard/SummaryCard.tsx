import { Card } from '@/components/ui/card';

interface SummaryCardProps {
  label: string;
  value: string | number;
  helper?: string;
}

export function SummaryCard({ label, value, helper }: SummaryCardProps) {
  return (
    <Card className="min-h-32">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-4 text-3xl font-bold tracking-tight text-foreground">{value}</div>
      {helper ? <div className="mt-2 text-xs text-muted-foreground">{helper}</div> : null}
    </Card>
  );
}
