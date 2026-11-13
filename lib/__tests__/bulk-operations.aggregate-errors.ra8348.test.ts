// RA-8348 review: aggregateErrors keys each error exactly as given, so two
// messages that differ only in spacing are both kept.
import { describe, expect, it } from 'vitest';
import { aggregateErrors } from '../bulk-operations';

describe('aggregateErrors (RA-8348)', () => {
  it('keeps messages that differ only in surrounding spaces', () => {
    const out = aggregateErrors([
      { reportId: 'r1', error: 'problem' },
      { reportId: 'r1', error: ' problem ' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('still drops an exact duplicate', () => {
    const out = aggregateErrors([
      { reportId: 'r1', error: 'problem' },
      { reportId: 'r1', error: 'problem' },
      { reportId: 'r2', error: 'problem' },
    ]);
    expect(out).toEqual([
      { reportId: 'r1', error: 'problem' },
      { reportId: 'r2', error: 'problem' },
    ]);
  });
});
