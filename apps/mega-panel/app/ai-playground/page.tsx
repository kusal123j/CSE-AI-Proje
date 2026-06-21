'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function AiPlaygroundPage() {
  const [question, setQuestion] = useState('');
  return (
    <div>
      <PageHeader title="Future AI/RAG Playground" description="Prepared UI placeholder for future company-document Q&A, retrieved chunks, source citations, and AI answers. No real AI backend is called in this version." />
      <Alert tone="warning" className="mb-6">This is a placeholder only. It does not call the AI/RAG backend and does not generate fake answers.</Alert>
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Question setup</CardTitle>
              <CardDescription>Future request builder for source-backed CSE research Q&A.</CardDescription>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a future question, for example: Summarize the latest annual report risk factors for a company." />
            <Input placeholder="Select/search company — future backend binding" disabled />
            <Input placeholder="Select/search symbol — future backend binding" disabled />
            <Select disabled>
              <option>Annual report</option>
              <option>Announcement</option>
              <option>Disclosure</option>
              <option>Market snapshot</option>
            </Select>
            <Button disabled>Run future RAG query</Button>
          </div>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Retrieved chunks placeholder</CardTitle></CardHeader><div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">No retrieved chunks yet. Future LangChain/Qdrant integration will display ranked source chunks here.</div></Card>
          <Card><CardHeader><CardTitle>Source citations placeholder</CardTitle></CardHeader><div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">No citations yet. Future source-backed answer citations will appear here.</div></Card>
          <Card><CardHeader><CardTitle>AI answer placeholder</CardTitle></CardHeader><div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">No AI answer generated. Backend AI endpoint is not connected in this implementation.</div></Card>
        </div>
      </div>
    </div>
  );
}
