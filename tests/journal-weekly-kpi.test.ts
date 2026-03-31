import { describe, expect, it } from 'vitest';
import { calculateJournalWeeklyKpi } from '@/lib/journal-weekly-kpi';

describe('calculateJournalWeeklyKpi', () => {
  it('counts forecast/fact/cancellations by statuses and multiplies by rate', () => {
    const result = calculateJournalWeeklyKpi({
      rateRub: 1500,
      slots: [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'planned' },
        { status: 'overdue' },
        { status: 'canceled' },
        { status: 'rescheduled' }
      ]
    });

    expect(result).toEqual({
      forecast: { amount: 7500, count: 5 },
      fact: { amount: 3000, count: 2 },
      cancellations: { amount: 1500, count: 1 }
    });
  });

  it('returns all zeros when rate is null or zero', () => {
    const slots = [{ status: 'completed' }, { status: 'planned' }, { status: 'canceled' }] as const;

    expect(calculateJournalWeeklyKpi({ slots: [...slots], rateRub: null })).toEqual({
      forecast: { amount: 0, count: 0 },
      fact: { amount: 0, count: 0 },
      cancellations: { amount: 0, count: 0 }
    });

    expect(calculateJournalWeeklyKpi({ slots: [...slots], rateRub: 0 })).toEqual({
      forecast: { amount: 0, count: 0 },
      fact: { amount: 0, count: 0 },
      cancellations: { amount: 0, count: 0 }
    });
  });
});
