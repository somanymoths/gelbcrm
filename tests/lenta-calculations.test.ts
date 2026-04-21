import { describe, expect, it } from 'vitest';
import {
  buildLentaTotals,
  calculateLentaMoney,
  validateLentaSettings,
  type LentaSettings,
  type LentaEventItem
} from '@/lib/lenta';

const settings: LentaSettings = {
  acquiringPercent: 3.5,
  taxPercent: 4,
  fundDevelopmentPercent: 40,
  fundSafetyPercent: 30,
  fundDividendsPercent: 30
};

describe('lenta calculations', () => {
  it('splits dividends to Yulia/Stas without rounding mismatch', () => {
    const money = calculateLentaMoney({
      lessonPrice: 2500,
      salary: 1380,
      settings
    });

    expect(money.dividends).toBe(money.yulia + money.stas);
  });

  it('excludes non-completed rows from totals', () => {
    const completedMoney = calculateLentaMoney({
      lessonPrice: 2500,
      salary: 2000,
      settings
    });
    const canceledMoney = calculateLentaMoney({
      lessonPrice: 2500,
      salary: 2000,
      settings
    });

    const rows: LentaEventItem[] = [
      {
        id: 'a',
        eventNumber: 1,
        lessonDate: '2026-04-01',
        lessonTime: '10:00',
        teacherId: 't1',
        teacherName: 'T1',
        studentId: 's1',
        studentName: 'S1',
        status: 'completed',
        statusLabel: 'Завершено',
        isCompleted: true,
        remainingPaidLessons: 10,
        remainingPaidLessonsPaidAt: null,
        sourcePaymentLinkId: null,
        rescheduleTargetDate: null,
        rescheduleTargetTime: null,
        rescheduleSourceDate: null,
        rescheduleSourceTime: null,
        isOldStudent: false,
        ...completedMoney
      },
      {
        id: 'b',
        eventNumber: 2,
        lessonDate: '2026-04-01',
        lessonTime: '11:00',
        teacherId: 't1',
        teacherName: 'T1',
        studentId: 's1',
        studentName: 'S1',
        status: 'canceled',
        statusLabel: 'Отменено',
        isCompleted: false,
        remainingPaidLessons: 10,
        remainingPaidLessonsPaidAt: null,
        sourcePaymentLinkId: null,
        rescheduleTargetDate: null,
        rescheduleTargetTime: null,
        rescheduleSourceDate: null,
        rescheduleSourceTime: null,
        isOldStudent: false,
        ...canceledMoney
      }
    ];

    const totals = buildLentaTotals(rows);

    expect(totals.completedCount).toBe(1);
    expect(totals.lessonPrice).toBe(completedMoney.lessonPrice);
    expect(totals.profit).toBe(completedMoney.profit);
  });

  it('validates funds sum equals 100%', () => {
    expect(() =>
      validateLentaSettings({
        ...settings,
        fundDevelopmentPercent: 35,
        fundSafetyPercent: 30,
        fundDividendsPercent: 30
      })
    ).toThrow('INVALID_FUNDS_SUM');

    expect(() => validateLentaSettings(settings)).not.toThrow();
  });
});
