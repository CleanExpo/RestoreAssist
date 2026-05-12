import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractColors } from '../extract-colors';

const fix = (name: string) => readFileSync(join(__dirname, '../__fixtures__', name));

describe('extractColors', () => {
  it('extracts a red primary from a red logo', async () => {
    const { primary } = await extractColors(fix('red-logo.png'));
    expect(primary.toLowerCase()).toMatch(/^#[c-f][0-9a-f]{5}/i); // some red-ish hex
  });

  it('returns a usable pair from a transparent logo (alpha respected)', async () => {
    const result = await extractColors(fix('transparent.png'));
    expect(result.primary).not.toEqual(result.accent);
  });

  it('flags low contrast when WCAG AA fails', async () => {
    const result = await extractColors(fix('low-contrast.png'));
    expect(result.contrastWarning).toBe(true);
  });
});
