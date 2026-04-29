import { z } from 'zod';
import { apiClient } from './api';

// Zod schemas for validation
export const BlockStatusSchema = z.object({
  block_id: z.string().uuid(),
  block_name: z.string(),
  district: z.string(),
  state: z.string(),
  total_farmers: z.number().int().nonnegative(),
  active_bundles: z.number().int().nonnegative(),
  upcoming_harvests: z.array(
    z.object({
      crop: z.string(),
      estimated_quantity: z.number().positive(),
      farmers_count: z.number().int().nonnegative(),
      preferred_mandi: z.string().optional(),
    })
  ),
  next_bundle_window: z.string().datetime().optional(),
  cooperative_status: z.enum(['active', 'forming', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const CooperativeBundleSchema = z.object({
  bundle_id: z.string().uuid(),
  block_id: z.string().uuid(),
  crop: z.string(),
  total_quantity: z.number().positive(),
  farmers: z.array(
    z.object({
      farmer_id: z.string().uuid(),
      farmer_name: z.string(),
      quantity: z.number().positive(),
      harvest_date: z.string(),
      status: z.enum(['pending', 'confirmed', 'completed']),
    })
  ),
  target_mandi: z.string(),
  negotiated_price: z.number().positive().optional(),
  status: z.enum(['forming', 'open', 'closed', 'transported', 'sold', 'settled']),
  created_at: z.string().datetime(),
  closes_at: z.string().datetime(),
  transported_at: z.string().datetime().optional(),
  sold_at: z.string().datetime().optional(),
});

export const BundleJoinRequestSchema = z.object({
  farmer_id: z.string().uuid(),
  bundle_id: z.string().uuid(),
  quantity: z.number().positive(),
  harvest_date: z.string(),
  notes: z.string().optional(),
});

export const BundleJoinResponseSchema = z.object({
  bundle: CooperativeBundleSchema,
  farmer_contribution: z.object({
    farmer_id: z.string().uuid(),
    quantity: z.number().positive(),
    share_percentage: z.number().min(0).max(100),
  }),
  message: z.string(),
});

export const CooperativeInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  bundle_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  invited_by: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'declined', 'expired']),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export type BlockStatus = z.infer<typeof BlockStatusSchema>;
export type CooperativeBundle = z.infer<typeof CooperativeBundleSchema>;
export type BundleJoinRequest = z.infer<typeof BundleJoinRequestSchema>;
export type BundleJoinResponse = z.infer<typeof BundleJoinResponseSchema>;
export type CooperativeInvitation = z.infer<typeof CooperativeInvitationSchema>;

/**
 * Get block cooperative status
 * GET /api/block/{blockId}/status
 * Cache: React Query with staleTime 5 minutes
 */
export async function getBlockStatus(blockId: string): Promise<BlockStatus> {
  try {
    const response = await apiClient.get(`/api/block/${blockId}/status`);
    return BlockStatusSchema.parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Get all bundles for a block
 * GET /api/block/{blockId}/bundles
 */
export async function getBlockBundles(blockId: string): Promise<CooperativeBundle[]> {
  try {
    const response = await apiClient.get(`/api/block/${blockId}/bundles`);
    return z.array(CooperativeBundleSchema).parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Get bundle details
 * GET /api/bundle/{bundleId}
 */
export async function getBundleDetails(bundleId: string): Promise<CooperativeBundle> {
  try {
    const response = await apiClient.get(`/api/bundle/${bundleId}`);
    return CooperativeBundleSchema.parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Join a cooperative bundle
 * POST /api/bundle/{bundleId}/join
 */
export async function joinBundle(
  bundleId: string,
  farmerId: string,
  contribution: {
    quantity: number;
    harvest_date: string;
    notes?: string;
  }
): Promise<BundleJoinResponse> {
  try {
    const response = await apiClient.post(`/api/bundle/${bundleId}/join`, {
      farmer_id: farmerId,
      ...contribution,
    });

    const validated = BundleJoinResponseSchema.parse(response.data);

    // Note: React Query cache invalidation should happen in the hook
    // This service layer just returns the data

    return validated;
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Leave a bundle
 * DELETE /api/bundle/{bundleId}/leave
 */
export async function leaveBundle(bundleId: string, farmerId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/bundle/${bundleId}/leave`, {
      data: { farmer_id: farmerId },
    });
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Create a new bundle
 * POST /api/bundle
 */
export async function createBundle(input: {
  block_id: string;
  crop: string;
  target_mandi: string;
  farmer_id: string;
  initial_quantity: number;
  harvest_date: string;
}): Promise<CooperativeBundle> {
  try {
    const response = await apiClient.post('/api/bundle', input);
    return CooperativeBundleSchema.parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Get farmer's bundles
 * GET /api/farmer/{farmerId}/bundles
 */
export async function getFarmerBundles(farmerId: string): Promise<CooperativeBundle[]> {
  try {
    const response = await apiClient.get(`/api/farmer/${farmerId}/bundles`);
    return z.array(CooperativeBundleSchema).parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Get pending invitations for a farmer
 * GET /api/farmer/{farmerId}/invitations
 */
export async function getPendingInvitations(farmerId: string): Promise<CooperativeInvitation[]> {
  try {
    const response = await apiClient.get(`/api/farmer/${farmerId}/invitations`);
    return z.array(CooperativeInvitationSchema).parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Accept or decline an invitation
 * POST /api/invitation/{invitationId}/respond
 */
export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
  quantity?: number,
  harvestDate?: string
): Promise<CooperativeBundle | null> {
  try {
    const response = await apiClient.post(`/api/invitation/${invitationId}/respond`, {
      accept,
      quantity,
      harvest_date: harvestDate,
    });

    if (accept) {
      return CooperativeBundleSchema.parse(response.data.bundle);
    }

    return null;
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Get bundle settlement details
 * GET /api/bundle/{bundleId}/settlement
 */
export async function getBundleSettlement(bundleId: string): Promise<{
  bundle_id: string;
  total_amount: number;
  settlements: Array<{
    farmer_id: string;
    farmer_name: string;
    quantity: number;
    share_percentage: number;
    amount: number;
    status: 'pending' | 'processing' | 'completed';
  }>;
  sold_price: number;
  sold_at: string;
}> {
  try {
    const response = await apiClient.get(`/api/bundle/${bundleId}/settlement`);

    return z.object({
      bundle_id: z.string(),
      total_amount: z.number(),
      settlements: z.array(
        z.object({
          farmer_id: z.string(),
          farmer_name: z.string(),
          quantity: z.number(),
          share_percentage: z.number(),
          amount: z.number(),
          status: z.enum(['pending', 'processing', 'completed']),
        })
      ),
      sold_price: z.number(),
      sold_at: z.string(),
    }).parse(response.data);
  } catch (error) {
    throw handleCooperativeError(error);
  }
}

/**
 * Handle cooperative service errors
 */
function handleCooperativeError(error: unknown): Error {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string } } };
    const detail = axiosError.response?.data?.detail;

    if (detail) {
      return new Error(sanitizeCooperativeError(detail));
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Could not process cooperative request. Please try again.');
}

/**
 * Sanitize cooperative error messages
 */
function sanitizeCooperativeError(message: string): string {
  const errorMap: Record<string, string> = {
    bundle_not_found: 'This cooperative bundle no longer exists.',
    bundle_closed: 'This bundle is closed and cannot accept new farmers.',
    already_joined: 'You have already joined this bundle.',
    farmer_not_found: 'Your account could not be found. Please login again.',
    block_not_found: 'This block is not in our system.',
    invitation_expired: 'This invitation has expired.',
    invitation_not_found: 'This invitation is no longer valid.',
    quantity_exceeded: 'This bundle has reached its maximum capacity.',
    invalid_quantity: 'Please enter a valid quantity.',
  };

  for (const [code, friendlyMessage] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(code.toLowerCase())) {
      return friendlyMessage;
    }
  }

  return message
    .replace(/\/[\w/.-]+/g, '[path]')
    .replace(/SELECT|INSERT|UPDATE|DELETE/gi, '[query]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .trim();
}

// React Query keys for caching
export const cooperativeQueryKeys = {
  blockStatus: (blockId: string) => ['cooperative', 'block', blockId, 'status'] as const,
  blockBundles: (blockId: string) => ['cooperative', 'block', blockId, 'bundles'] as const,
  bundleDetails: (bundleId: string) => ['cooperative', 'bundle', bundleId] as const,
  farmerBundles: (farmerId: string) => ['cooperative', 'farmer', farmerId, 'bundles'] as const,
  invitations: (farmerId: string) => ['cooperative', 'farmer', farmerId, 'invitations'] as const,
  settlement: (bundleId: string) => ['cooperative', 'bundle', bundleId, 'settlement'] as const,
};

export const cooperativeService = {
  getBlockStatus,
  getBlockBundles,
  getBundleDetails,
  joinBundle,
  leaveBundle,
  createBundle,
  getFarmerBundles,
  getPendingInvitations,
  respondToInvitation,
  getBundleSettlement,
};

export default cooperativeService;