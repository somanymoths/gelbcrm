export type JournalWeeklyKpiMetric = {
  amount: number;
  count: number;
};

export type JournalWeeklyKpi = {
  forecast: JournalWeeklyKpiMetric;
  fact: JournalWeeklyKpiMetric;
  cancellations: JournalWeeklyKpiMetric;
};

type SlotLike = {
  status:
    | 'planned'
    | 'overdue'
    | 'completed'
    | 'rescheduled'
    | 'canceled'
    | 'teacher_vacation'
    | 'student_vacation'
    | 'holidays';
};

const ZERO_METRIC: JournalWeeklyKpiMetric = { amount: 0, count: 0 };

export function getZeroJournalWeeklyKpi(): JournalWeeklyKpi {
  return {
    forecast: { ...ZERO_METRIC },
    fact: { ...ZERO_METRIC },
    cancellations: { ...ZERO_METRIC }
  };
}

export function calculateJournalWeeklyKpi(input: {
  slots: SlotLike[];
  rateRub: number | null | undefined;
}): JournalWeeklyKpi {
  const normalizedRate = Number(input.rateRub ?? 0);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) {
    return getZeroJournalWeeklyKpi();
  }

  let forecastCount = 0;
  let factCount = 0;
  let cancellationsCount = 0;

  for (const slot of input.slots) {
    if (slot.status === 'completed') {
      forecastCount += 1;
      factCount += 1;
      continue;
    }

    if (slot.status === 'planned' || slot.status === 'overdue') {
      forecastCount += 1;
      continue;
    }

    if (slot.status === 'canceled') {
      forecastCount += 1;
      cancellationsCount += 1;
    }
  }

  const rate = Math.round(normalizedRate);

  return {
    forecast: {
      count: forecastCount,
      amount: Math.round(forecastCount * rate)
    },
    fact: {
      count: factCount,
      amount: Math.round(factCount * rate)
    },
    cancellations: {
      count: cancellationsCount,
      amount: Math.round(cancellationsCount * rate)
    }
  };
}
