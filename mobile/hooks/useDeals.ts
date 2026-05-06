import { useCallback, useEffect, useState } from 'react';
import { n8nService } from '../services/n8nService';
import { apiClient } from '../services/api';
import { useAppStore } from '../store';
import { cooperativeService, CooperativeBundle } from '../services/cooperativeService';

export type DealStatus =
  | 'open'
  | 'filling'
  | 'confirmed'
  | 'truck_booked'
  | 'departed'
  | 'settled';

export type DealMember = {
  farmer_id: string;
  name: string;
  village: string;
  avatar: string;
  quantity: number;
  phone: string;
  status: 'confirmed' | 'pending' | 'completed';
  joined_at: string;
};

export type TruckAgency = {
  agency_id: string;
  kisansabha_id: string;
  name: string;
  state: string;
  city: string;
  phone: string;
  whatsapp: string;
  category_type: number;
  category_name: string;
  rating: number;
  total_trips: number;
  vehicle_types: string[];
  price_per_km: number | null;
  distance_km: number | null;
  profile_url: string;
  verified: boolean;
  source: string;
};

export type TruckInfo = {
  driver_name: string;
  driver_phone: string;
  pickup_time: string;
  eta_mandi: string;
  vehicle_no: string;
  agency: TruckAgency;
  booking_id: string;
  estimated_cost: number;
};

export type Deal = {
  deal_id: string;
  crop: string;
  crop_emoji: string;
  target_mandi: string;
  mandi_price: number;
  price_change_pct: number;
  target_quantity: number;
  current_quantity: number;
  members: DealMember[];
  posted_by_farmer_id: string;
  block_id: string;
  distance_km: number;
  proposed_date: string;
  expires_at: string;
  status: DealStatus;
  savings_per_quintal: number;
  truck?: TruckInfo;
};

const MOCK_DEALS: Deal[] = [
  {
    deal_id: 'DEAL-001',
    crop: 'Tomato',
    crop_emoji: '🍅',
    target_mandi: 'Kolar APMC',
    mandi_price: 34,
    price_change_pct: 12,
    target_quantity: 100,
    current_quantity: 80,
    distance_km: 3.2,
    proposed_date: '2026-05-03',
    expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'filling',
    savings_per_quintal: 180,
    posted_by_farmer_id: 'F1',
    block_id: 'BLK-001',
    members: [
      { farmer_id: 'F1', name: 'Ramesh Kumar', village: 'Nallur', avatar: '👨‍🌾', quantity: 20, phone: '+919876543210', status: 'confirmed', joined_at: new Date(Date.now() - 3 * 3600000).toISOString() },
      { farmer_id: 'F2', name: 'Sunita Devi', village: 'Kotur', avatar: '👩‍🌾', quantity: 15, phone: '+919876543211', status: 'confirmed', joined_at: new Date(Date.now() - 2 * 3600000).toISOString() },
      { farmer_id: 'F3', name: 'Govind Rao', village: 'Pura', avatar: '👨‍🌾', quantity: 12, phone: '+919876543212', status: 'confirmed', joined_at: new Date(Date.now() - 1 * 3600000).toISOString() },
    ],
  },
  {
    deal_id: 'DEAL-002',
    crop: 'Onion',
    crop_emoji: '🧅',
    target_mandi: 'Bangalore APMC',
    mandi_price: 28,
    price_change_pct: -5,
    target_quantity: 150,
    current_quantity: 45,
    distance_km: 8.1,
    proposed_date: '2026-05-05',
    expires_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    savings_per_quintal: 140,
    posted_by_farmer_id: 'F6',
    block_id: 'BLK-001',
    members: [
      { farmer_id: 'F6', name: 'Anand Reddy', village: 'Hosur', avatar: '👨‍🌾', quantity: 25, phone: '+919876543215', status: 'confirmed', joined_at: new Date(Date.now() - 5 * 3600000).toISOString() },
      { farmer_id: 'F7', name: 'Meena Kumari', village: 'Sira', avatar: '👩‍🌾', quantity: 20, phone: '+919876543216', status: 'confirmed', joined_at: new Date(Date.now() - 4 * 3600000).toISOString() },
    ],
  },
  {
    deal_id: 'DEAL-003',
    crop: 'Potato',
    crop_emoji: '🥔',
    target_mandi: 'Mysore APMC',
    mandi_price: 22,
    price_change_pct: 8,
    target_quantity: 80,
    current_quantity: 20,
    distance_km: 5.6,
    proposed_date: '2026-05-04',
    expires_at: new Date(Date.now() + 0.5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    savings_per_quintal: 120,
    posted_by_farmer_id: 'F8',
    block_id: 'BLK-001',
    members: [
      { farmer_id: 'F8', name: 'Vikram Singh', village: 'Pandavapura', avatar: '👨‍🌾', quantity: 20, phone: '+919876543217', status: 'confirmed', joined_at: new Date(Date.now() - 6 * 3600000).toISOString() },
    ],
  },
];

function bundleToDeal(bundle: CooperativeBundle, index: number): Deal {
  const currentQty = bundle.farmers.reduce((s, f) => s + f.quantity, 0);
  const statusMap: Record<string, DealStatus> = {
    forming: 'open',
    open: 'filling',
    closed: 'confirmed',
    transported: 'departed',
    sold: 'settled',
  };
  return {
    deal_id: bundle.bundle_id,
    crop: bundle.crop,
    crop_emoji: bundle.crop === 'Tomato' ? '🍅' : bundle.crop === 'Onion' ? '🧅' : bundle.crop === 'Potato' ? '🥔' : '🌾',
    target_mandi: bundle.target_mandi,
    mandi_price: bundle.negotiated_price || 30,
    price_change_pct: 5,
    target_quantity: Math.ceil(currentQty * 1.2),
    current_quantity: currentQty,
    members: bundle.farmers.map((f) => ({
      farmer_id: f.farmer_id,
      name: f.farmer_name,
      village: 'Village',
      avatar: '👨‍🌾',
      quantity: f.quantity,
      phone: '',
      status: f.status,
      joined_at: f.harvest_date,
    })),
    posted_by_farmer_id: bundle.farmers[0]?.farmer_id || '',
    block_id: bundle.bundle_id.split('-')[0] || 'BLK-001',
    distance_km: 5,
    proposed_date: bundle.farmers[0]?.harvest_date || new Date().toISOString(),
    expires_at: bundle.closes_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: statusMap[bundle.status] || 'open',
    savings_per_quintal: 150,
  };
}

export function useDeals(farmerId?: string) {
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [myJoinedDealIds, setMyJoinedDealIds] = useState<string[]>([]);
  const [triggeringDealId, setTriggeringDealId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const addToast = useAppStore((s) => s.addToast);

  useEffect(() => {
    if (!farmerId) return;

    const fetchDeals = async () => {
      setIsLoading(true);
      try {
        const bundles = await cooperativeService.getFarmerBundles(farmerId);
        if (bundles.length > 0) {
          const apiDeals = bundles.map((b, i) => bundleToDeal(b, i));
          setDeals(apiDeals);
          const joined = bundles
            .filter((b) => b.farmers.some((f) => f.farmer_id === farmerId))
            .map((b) => b.bundle_id);
          setMyJoinedDealIds(joined);
        }
      } catch (err) {
        console.log('[useDeals] Using mock data, backend not available');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeals();
  }, [farmerId]);

  const joinDeal = useCallback(async (dealId: string, quantity: number, myFarmerId = 'ME') => {
    const myMember: DealMember = {
      farmer_id: myFarmerId,
      name: 'You',
      village: 'Your Village',
      avatar: '🧑‍🌾',
      quantity,
      phone: '+916380221196',
      status: 'confirmed',
      joined_at: new Date().toISOString(),
    };

    try {
      const result = await cooperativeService.joinBundle(dealId, myFarmerId, {
        quantity,
        harvest_date: new Date().toISOString(),
      });

      if (result) {
        setMyJoinedDealIds((prev) => [...prev, dealId]);
        addToast('Joined the bundle successfully!', 'success');
      }
    } catch (err) {
      console.log('[useDeals] Backend join failed, using local update');
    }

    let confirmedDeal: Deal | null = null;
    setDeals((prev) =>
      prev.map((d) => {
        if (d.deal_id !== dealId) return d;
        const newQty = d.current_quantity + quantity;
        const newStatus: DealStatus = newQty >= d.target_quantity ? 'confirmed' : 'filling';
        const updated: Deal = {
          ...d,
          current_quantity: newQty,
          status: newStatus,
          members: [...d.members, myMember],
        };
        if (newStatus === 'confirmed') confirmedDeal = updated;
        return updated;
      })
    );

    setMyJoinedDealIds((prev) => (prev.includes(dealId) ? prev : [...prev, dealId]));
    setSelectedDeal((prev) => {
      if (!prev || prev.deal_id !== dealId) return prev;
      const newQty = prev.current_quantity + quantity;
      return {
        ...prev,
        current_quantity: newQty,
        status: newQty >= prev.target_quantity ? 'confirmed' : 'filling',
        members: [...prev.members, myMember],
      };
    });

    if (confirmedDeal) {
      await autoTriggerOnConfirmed(confirmedDeal, setDeals, addToast, setTriggeringDealId);
    }
  }, [addToast]);

  const postDeal = useCallback(async (newDeal: Omit<Deal, 'deal_id' | 'members' | 'current_quantity' | 'status'>) => {
    try {
      const bundle = await cooperativeService.createBundle({
        block_id: newDeal.block_id,
        crop: newDeal.crop,
        target_mandi: newDeal.target_mandi,
        farmer_id: newDeal.posted_by_farmer_id,
        initial_quantity: 0,
        harvest_date: newDeal.proposed_date,
      });

      if (bundle) {
        addToast('Deal posted! Nearby farmers will be notified. 🌾', 'success');
      }
    } catch (err) {
      console.log('[useDeals] Backend post failed, using local update');
    }

    const deal: Deal = {
      ...newDeal,
      deal_id: 'DEAL-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      members: [],
      current_quantity: 0,
      status: 'open',
    };
    setDeals((prev) => [deal, ...prev]);
    addToast('Deal posted! Nearby farmers will be notified. 🌾', 'success');
  }, [addToast]);

  const openDeal = useCallback((deal: Deal) => setSelectedDeal(deal), []);
  const closeDeal = useCallback(() => setSelectedDeal(null), []);

  const isMyDeal = (dealId: string) => myJoinedDealIds.includes(dealId);

  const filterByDeal = (crop: string | null) => {
    if (!crop) return deals;
    return deals.filter((d) => d.crop === crop);
  };

  return {
    deals,
    selectedDeal,
    myJoinedDealIds,
    triggeringDealId,
    isLoading,
    joinDeal,
    postDeal,
    openDeal,
    closeDeal,
    isMyDeal,
    filterByDeal,
  };
}

async function autoTriggerOnConfirmed(
  deal: Deal,
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>,
  addToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setTriggeringDealId: (id: string | null) => void,
) {
  setTriggeringDealId(deal.deal_id);
  const phones = deal.members.map((m) => m.phone);

  try {
    await n8nService.triggerBundleNotification({
      bundle_id: deal.deal_id,
      crop: deal.crop,
      message: `Deal confirmed! ${deal.current_quantity} quintals of ${deal.crop} heading to ${deal.target_mandi}. Truck booking in progress.`,
      language: 'hi',
      farmer_phones: phones,
    });

    const matchRes = await apiClient.post('/api/truck/match', {
      crop: deal.crop,
      weight_tons: deal.current_quantity / 10,
      pickup_block: deal.block_id,
      destination_mandi: deal.target_mandi,
      state: 'Karnataka',
    });
    const matchData = matchRes.data;

    await n8nService.triggerAutomation('truck_booking', {
      bundle_id: deal.deal_id,
      cooperative_size_tons: deal.current_quantity / 10,
      farmer_count: deal.members.length,
      pickup_block: deal.block_id,
      destination_mandi: deal.target_mandi,
      crop: deal.crop,
      farmer_phones: phones,
      farmer_phone: phones[0] || '',
      driver_phone: matchData.driver_phone,
      agency_name: matchData.agency?.name,
    });

    const truck: TruckInfo = {
      driver_name: matchData.driver_name,
      driver_phone: matchData.driver_phone,
      pickup_time: matchData.pickup_time,
      eta_mandi: matchData.eta_mandi,
      vehicle_no: matchData.vehicle_no,
      agency: matchData.agency,
      booking_id: matchData.booking_id,
      estimated_cost: matchData.estimated_cost,
    };

    setDeals((prev) =>
      prev.map((d) =>
        d.deal_id === deal.deal_id ? { ...d, status: 'truck_booked', truck } : d
      )
    );

    addToast(`Truck booked via ${matchData.agency?.name || 'KisanSabha'}! All farmers notified.`, 'success');
  } catch (err) {
    addToast('Deal confirmed! Truck booking pending -- check network.', 'info');
    setDeals((prev) =>
      prev.map((d) =>
        d.deal_id === deal.deal_id ? { ...d, status: 'confirmed' } : d
      )
    );
  } finally {
    setTriggeringDealId(null);
  }
}
