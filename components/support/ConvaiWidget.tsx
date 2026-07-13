'use client';

import { createElement } from 'react';
import Script from 'next/script';

const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim();

export function ConvaiWidget() {
  if (!agentId) return null;
  return (
    <>
      <Script src="https://unpkg.com/@elevenlabs/convai-widget-embed" strategy="afterInteractive" />
      {createElement('elevenlabs-convai', { 'agent-id': agentId })}
    </>
  );
}
