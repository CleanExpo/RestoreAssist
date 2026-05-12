'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function StorageCard() {
  const status = useSetupStore((s) => s.sections.storage);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud storage</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Stub — Task 25 replaces this. Current status: <span className="font-mono">{status}</span>
      </CardContent>
    </Card>
  );
}
