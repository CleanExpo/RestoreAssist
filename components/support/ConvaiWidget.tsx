'use client';

// NEXT_PUBLIC_ELEVENLABS_AGENT_ID is inlined by Next at BUILD time — its value is
// baked into the client bundle when `next build` runs, not read at request time.
// Go-live therefore requires setting it as a build-time environment variable AND
// rebuilding/redeploying; changing it only at runtime will not reach the client
// bundle and the widget will stay dark.
import { createElement } from 'react';
import Script from 'next/script';

const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim();

export function ConvaiWidget() {
  if (!agentId) return null;
  return (
    <>
      <Script src="https://unpkg.com/@elevenlabs/convai-widget-embed@0.14.10" strategy="afterInteractive" />
      {createElement('elevenlabs-convai', { 'agent-id': agentId })}
    </>
  );
}
