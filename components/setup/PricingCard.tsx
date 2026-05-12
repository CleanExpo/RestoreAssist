'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function PricingCard() {
  const status = useSetupStore((s) => s.sections.pricing);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your pricing structure</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Stub — Task 24 replaces this. Current status: <span className="font-mono">{status}</span>
      </CardContent>
    </Card>
  );
}
