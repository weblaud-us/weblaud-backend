import {
  ACCEPTED_BUDGET_OPTIONS,
  BUDGET_LABELS,
  BUDGET_OPTIONS,
  LEGACY_BUDGET_OPTIONS,
} from './lead.constants';

describe('budget bands', () => {
  it('offers the current bands in order', () => {
    expect(BUDGET_OPTIONS).toEqual([
      'under_10k',
      '10k_25k',
      '25k_50k',
      '50k_plus',
      'not_sure',
    ]);
  });

  it('keeps every legacy band accepted and labelled as it was', () => {
    expect(ACCEPTED_BUDGET_OPTIONS).toEqual(
      expect.arrayContaining([...LEGACY_BUDGET_OPTIONS]),
    );
    expect(BUDGET_LABELS).toMatchObject({
      under_5k: 'Under $5k',
      '5k_10k': '$5k – $10k',
      '10k_20k': '$10k – $20k',
      '20k_plus': '$20k+',
    });
  });

  it('has a label for every accepted value and no overlap between lists', () => {
    for (const value of ACCEPTED_BUDGET_OPTIONS) {
      expect(BUDGET_LABELS[value]).toBeTruthy();
    }
    const overlap = BUDGET_OPTIONS.filter((v) =>
      (LEGACY_BUDGET_OPTIONS as readonly string[]).includes(v),
    );
    expect(overlap).toEqual([]);
  });
});
