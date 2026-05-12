'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function BrandCard() {
  const status = useSetupStore((s) => s.sections.branding);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your brand</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Stub — Task 23 replaces this. Current status: <span className="font-mono">{status}</span>
      </CardContent>
    </Card>
  );
}
