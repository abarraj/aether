// Plan definitions and pure helpers for Aether billing.

import type { Plan, PlanLimits } from '@/types/domain';

export const PLANS: Record<
  Plan,
  {
    name: string;
    price: string;
    limits: PlanLimits;
  }
> = {
  starter: {
    name: 'Starter',
    price: '$99/mo',
    limits: {
      dataSources: 3,
      users: 2,
      storageMb: 50,
      aiTier: 'basic',
      aiCreditsPerMonth: 100,
      maxRowsPerMonth: 10_000,
      maxActiveStreams: 3,
    },
  },
  growth: {
    name: 'Growth',
    price: '$199/mo',
    limits: {
      dataSources: null,
      users: 25,
      storageMb: 5000,
      aiTier: 'full',
      aiCreditsPerMonth: 1_000,
      maxRowsPerMonth: 500_000,
      maxActiveStreams: 25,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    limits: {
      dataSources: null,
      users: null,
      storageMb: null,
      aiTier: 'enterprise',
      aiCreditsPerMonth: null,
      maxRowsPerMonth: null,
      maxActiveStreams: null,
    },
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLANS[plan].limits;
}
