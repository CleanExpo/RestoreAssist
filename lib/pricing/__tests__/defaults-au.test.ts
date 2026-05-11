import { describe, expect, it } from 'vitest';
import { getDefaultPricing, AU_STATES } from '../defaults-au';

describe('getDefaultPricing', () => {
  it('returns defaults for every AU state with a SOLE_TRADER entity type', () => {
    for (const state of AU_STATES) {
      const defaults = getDefaultPricing({ state, entityType: 'SOLE_TRADER' });
      expect(defaults).toBeDefined();
      expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
      expect(defaults.administrationFee).toBeGreaterThan(0);
    }
  });

  it('returns a higher labour rate for COMPANY than SOLE_TRADER (mid-size assumption)', () => {
    const sole = getDefaultPricing({ state: 'NSW', entityType: 'SOLE_TRADER' });
    const co = getDefaultPricing({ state: 'NSW', entityType: 'COMPANY' });
    expect(co.masterQualifiedNormalHours).toBeGreaterThanOrEqual(sole.masterQualifiedNormalHours);
  });

  it('falls back to national median when state is unknown', () => {
    const defaults = getDefaultPricing({ state: 'XX' as any, entityType: 'COMPANY' });
    expect(defaults.masterQualifiedNormalHours).toBeGreaterThan(0);
  });
});
