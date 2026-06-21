'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CseMarketRankingItem } from '@/lib/types/cse';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TurnoverBarChart({ rows, title = 'Top turnover' }: { rows: CseMarketRankingItem[]; title?: string }) {
  const data = rows.map((row) => ({ symbol: row.symbol, value: Number(row.turnover || 0) })).filter((row) => row.value > 0);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Internally calculated from saved ALPHABETICAL market snapshot data.</CardDescription>
        </div>
      </CardHeader>
      <div className="h-80">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="symbol" />
              <YAxis tickFormatter={(value) => `${Number(value) / 1000000}M`} />
              <Tooltip formatter={(value) => [`Rs. ${Number(value).toLocaleString('en-LK')}`, 'Turnover']} />
              <Bar dataKey="value" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No turnover data available.</div>
        )}
      </div>
    </Card>
  );
}
