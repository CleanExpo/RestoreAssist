'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function BusinessDetailsCard() {
  const status = useSetupStore((s) => s.sections.businessDetails);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Stub — Task 22 replaces this. Current status: <span className="font-mono">{status}</span>
      </CardContent>
    </Card>
  );
}
