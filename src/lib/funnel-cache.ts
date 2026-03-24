import { invalidateRequestCache } from '@/lib/request-cache';

export const FunnelCacheKeys = {
  board: 'funnel:board',
  teachers: 'funnel:teachers',
  stages: 'funnel:stages',
  lossReasons: 'funnel:loss-reasons',
  paymentTariffs: 'funnel:payment-tariffs',
  archived: 'funnel:archived',
  card: (cardId: string) => `funnel:card:${cardId}`,
  cardAudit: (cardId: string) => `funnel:card-audit:${cardId}`,
  cardComments: (cardId: string) => `funnel:card-comments:${cardId}`,
  cardPaymentLinks: (cardId: string) => `funnel:card-payment-links:${cardId}`
} as const;

export function invalidateFunnelBoardRelatedCache(): void {
  invalidateRequestCache(FunnelCacheKeys.board);
  invalidateRequestCache(FunnelCacheKeys.archived);
  invalidateRequestCache(FunnelCacheKeys.stages);
  invalidateRequestCache(FunnelCacheKeys.lossReasons);
  invalidateRequestCache(FunnelCacheKeys.teachers);
  invalidateRequestCache(FunnelCacheKeys.paymentTariffs);
}

export function invalidateFunnelCardCache(cardId: string): void {
  invalidateRequestCache(FunnelCacheKeys.card(cardId));
  invalidateRequestCache(FunnelCacheKeys.cardAudit(cardId));
  invalidateRequestCache(FunnelCacheKeys.cardComments(cardId));
  invalidateRequestCache(FunnelCacheKeys.cardPaymentLinks(cardId));
}
