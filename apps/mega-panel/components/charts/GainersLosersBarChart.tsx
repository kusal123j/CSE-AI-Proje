'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CseMarketRankingItem } from '@/lib/types/cse';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function GainersLosersBarChart({ rows, title }: { rows: CseMarketRankingItem[]; title: string }) {
  const data = rows.map((row) => ({ symbol: row.symbol, value: Number(row.change_percent || 0) })).filter((row) => Number.isFinite(row.value));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Percentage movement calculated from internally saved snapshot rows.</CardDescription>
        </div>
      </CardHeader>
      <div className="h-72">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="symbol" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Change %']} />
              <Bar dataKey="value" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No movement data available.</div>
        )}
      </div>
    </Card>
  );
}
