import { describe, expect, it, vi } from 'vitest';
import { extractAboutCopy } from '../extract-about';

vi.mock('@/lib/ai/model-router', () => ({
  routeBasic: vi.fn(),
}));

import { routeBasic } from '@/lib/ai/model-router';

describe('extractAboutCopy', () => {
  it('returns null for clearly empty hero text', async () => {
    const result = await extractAboutCopy('');
    expect(result).toBeNull();
  });

  it('returns the Gemma paragraph when confidence is high', async () => {
    (routeBasic as any).mockResolvedValueOnce({
      text: 'ACME Restoration is a Sydney-based water damage specialist serving NSW.',
      confidence: 0.92,
    });
    const result = await extractAboutCopy('ACME Restoration\nWe restore water-damaged buildings across NSW.');
    expect(result?.paragraph).toContain('ACME');
  });

  it('returns null when Gemma confidence falls below threshold', async () => {
    (routeBasic as any).mockResolvedValueOnce({ text: '...', confidence: 0.3 });
    const result = await extractAboutCopy('garbage 404 page text');
    expect(result).toBeNull();
  });
});
