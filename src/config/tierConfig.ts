/**
 * API key tiers and limits (V2).
 *
 * All numeric limits (monthly quotas, batch sizes, url limits, concurrency)
 * are centralized here to avoid hardcoding values in multiple places.
 */

export type TierName = 'FREE' | 'STARTER' | 'PRO';

export interface TierConfig {
  monthlyQuota: number;
  maxBatchSize: number;
  maxUrls: number;
  maxConcurrentJobs: number;
  capacity: number;
  refillRate: number; // tokens per second
}

export const TIER_CONFIG: Record<TierName, TierConfig> = {
  FREE: {
    monthlyQuota: 30,
    maxBatchSize: 3,
    maxUrls: 3,
    maxConcurrentJobs: 1,
    capacity: 30,
    refillRate: 0.5,
  },
  STARTER: {
    monthlyQuota: 500,
    maxBatchSize: 10,
    maxUrls: 10,
    maxConcurrentJobs: 2,
    capacity: 120,
    refillRate: 2,
  },
  PRO: {
    monthlyQuota: 2500,
    maxBatchSize: 25,
    maxUrls: 25,
    maxConcurrentJobs: 5,
    capacity: 600,
    refillRate: 10,
  },
};

export function getTierConfig(tier: string): TierConfig {
  if (tier === 'STARTER' || tier === 'PRO' || tier === 'FREE') {
    return TIER_CONFIG[tier];
  }

  // Fallback to FREE for unknown / legacy values
  return TIER_CONFIG.FREE;
}
