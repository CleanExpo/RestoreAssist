'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

export function IntegrationsCard() {
  const status = useSetupStore((s) => s.sections.integrations);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your existing tools</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Stub — Task 26 replaces this. Current status: <span className="font-mono">{status}</span>
      </CardContent>
    </Card>
  );
}
