import { useAppStore, selectFarmer, selectIsAuthenticated } from '../store/useAppStore';

/**
 * Hook to access the current farmer's identity.
 * Returns farmer profile, ID, and a placeholder for unauthenticated users.
 */
export function useFarmerIdentity() {
  const farmer = useAppStore(selectFarmer);
  const isAuthenticated = useAppStore(selectIsAuthenticated);

  const farmerId = farmer?.id || 'guest-' + Date.now().toString(36);
  const name = farmer?.name || 'Farmer';
  const state = farmer?.state || 'Maharashtra';
  const district = farmer?.district || '';
  const block = farmer?.block || '';
  const village = farmer?.village || '';
  const primaryCrops = farmer?.primary_crops || ['Tomato'];
  const language = farmer?.preferred_language || 'en';

  return {
    farmerId,
    name,
    state,
    district,
    block,
    village,
    primaryCrops,
    language,
    isAuthenticated,
    farmer,
  };
}

export default useFarmerIdentity;
