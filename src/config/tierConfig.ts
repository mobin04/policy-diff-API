/**
 * API key tiers and limits.
 *
 * All numeric limits (monthly quotas, batch sizes) are centralized here
 * to avoid hardcoding values in multiple places.
 */

export type ApiTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export type TierConfig = {
  /** Maximum jobs per month for this tier. */
  monthlyQuota: number;
  /** Maximum jobs allowed in a single batch submission. */
  maxBatchSize: number;
};

export const TIER_CONFIG: Record<ApiTier, TierConfig> = {
  FREE: {
    monthlyQuota: 100,
    maxBatchSize: 5,
  },
  PRO: {
    monthlyQuota: 2000,
    maxBatchSize: 20,
  },
  ENTERPRISE: {
    // Represent "unlimited" with a very high ceiling.
    monthlyQuota: 2_147_483_647,
    maxBatchSize: 50,
  },
};

export function getTierConfig(tier: string): TierConfig {
  if (tier === 'PRO' || tier === 'ENTERPRISE' || tier === 'FREE') {
    return TIER_CONFIG[tier];
  }

  // Fallback to FREE for unknown / legacy values
  return TIER_CONFIG.FREE;
}
