import { useState, useCallback } from 'react';
import { n8nService } from '../services/n8nService';
import { useAppStore } from '../store';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

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
  quantity: number;   // quintals
  phone: string;
  status: 'confirmed' | 'pending';
  joined_at: string;
};

export type TruckInfo = {
  driver_name: string;
  driver_phone: string;
  pickup_time: string;
  eta_mandi: string;
  vehicle_no: string;
};

export type Deal = {
  deal_id: string;
  crop: string;
  crop_emoji: string;
  target_mandi: string;
  mandi_price: number;       // ₹/kg
  price_change_pct: number;  // vs yesterday
  target_quantity: number;   // quintals needed to lock
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

// ─────────────────────────────────────────────
// MOCK DATA (realistic, ready for API swap)
// ─────────────────────────────────────────────

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
      { farmer_id: 'F1', name: 'Ramesh Kumar',  village: 'Nallur',  avatar: '👨‍🌾', quantity: 20, phone: '+919876543210', status: 'confirmed', joined_at: new Date(Date.now() - 3 * 3600000).toISOString() },
      { farmer_id: 'F2', name: 'Sunita Devi',   village: 'Kotur',   avatar: '👩‍🌾', quantity: 15, phone: '+919876543211', status: 'confirmed', joined_at: new Date(Date.now() - 2 * 3600000).toISOString() },
      { farmer_id: 'F3', name: 'Govind Rao',    village: 'Pura',    avatar: '👨‍🌾', quantity: 12, phone: '+919876543212', status: 'confirmed', joined_at: new Date(Date.now() - 1 * 3600000).toISOString() },
      { farmer_id: 'F4', name: 'Lakshmi Bai',   village: 'Kotur',   avatar: '👩‍🌾', quantity: 18, phone: '+919876543213', status: 'confirmed', joined_at: new Date(Date.now() - 0.5 * 3600000).toISOString() },
      { farmer_id: 'F5', name: 'Mohan Lal',     village: 'Nallur',  avatar: '👨‍🌾', quantity: 15, phone: '+919876543214', status: 'confirmed', joined_at: new Date(Date.now() - 0.2 * 3600000).toISOString() },
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
      { farmer_id: 'F6', name: 'Anand Reddy',   village: 'Hosur',   avatar: '👨‍🌾', quantity: 25, phone: '+919876543215', status: 'confirmed', joined_at: new Date(Date.now() - 5 * 3600000).toISOString() },
      { farmer_id: 'F7', name: 'Meena Kumari',  village: 'Sira',    avatar: '👩‍🌾', quantity: 20, phone: '+919876543216', status: 'confirmed', joined_at: new Date(Date.now() - 4 * 3600000).toISOString() },
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
      { farmer_id: 'F8', name: 'Vikram Singh',  village: 'Pandavapura', avatar: '👨‍🌾', quantity: 20, phone: '+919876543217', status: 'confirmed', joined_at: new Date(Date.now() - 6 * 3600000).toISOString() },
    ],
  },
];

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [myJoinedDealIds, setMyJoinedDealIds] = useState<string[]>([]);
  const [triggeringDealId, setTriggeringDealId] = useState<string | null>(null);
  const addToast = useAppStore((s) => s.addToast);

  // Join a deal — add farmer's quantity, check if target hit
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

    setMyJoinedDealIds((prev) => [...prev, dealId]);
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

    // If target hit → auto-trigger n8n
    if (confirmedDeal) {
      await autoTriggerOnConfirmed(confirmedDeal, setDeals, addToast, setTriggeringDealId);
    }
  }, [addToast]);

  // Post a new deal
  const postDeal = useCallback((newDeal: Omit<Deal, 'deal_id' | 'members' | 'current_quantity' | 'status'>) => {
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
    joinDeal,
    postDeal,
    openDeal,
    closeDeal,
    isMyDeal,
    filterByDeal,
  };
}

// ─────────────────────────────────────────────
// AUTO-TRIGGER HELPER
// ─────────────────────────────────────────────

async function autoTriggerOnConfirmed(
  deal: Deal,
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>,
  addToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setTriggeringDealId: (id: string | null) => void,
) {
  setTriggeringDealId(deal.deal_id);
  const phones = deal.members.map((m) => m.phone);

  try {
    // Step 1: Notify all farmers
    await n8nService.triggerBundleNotification({
      bundle_id: deal.deal_id,
      crop: deal.crop,
      message: `🎉 Deal confirmed! ${deal.current_quantity} quintals of ${deal.crop} heading to ${deal.target_mandi}. Truck booking in progress.`,
      language: 'hi',
      farmer_phones: phones,
    });

    // Step 2: Book truck
    await n8nService.triggerAutomation('truck_booking', {
      bundle_id: deal.deal_id,
      mandi: deal.target_mandi,
      crop: deal.crop,
      weight: (deal.current_quantity / 10).toFixed(1) + ' tons',
      pickup_date: deal.proposed_date,
      farmer_phones: phones,
      driver_phone: '+916380221196',
    });

    // Update deal status to truck_booked with mock driver info
    const truck: TruckInfo = {
      driver_name: 'Anand Transport',
      driver_phone: '+916380221196',
      pickup_time: deal.proposed_date + ' 07:00 AM',
      eta_mandi: deal.proposed_date + ' 10:30 AM',
      vehicle_no: 'KA-02-AB-' + Math.floor(1000 + Math.random() * 9000),
    };

    setDeals((prev) =>
      prev.map((d) =>
        d.deal_id === deal.deal_id ? { ...d, status: 'truck_booked', truck } : d
      )
    );

    addToast('🚛 Truck booked! All farmers notified via SMS & call.', 'success');
  } catch (err) {
    addToast('Deal confirmed! Truck booking pending — check network.', 'info');
    // Still mark as confirmed even if n8n fails
    setDeals((prev) =>
      prev.map((d) =>
        d.deal_id === deal.deal_id ? { ...d, status: 'confirmed' } : d
      )
    );
  } finally {
    setTriggeringDealId(null);
  }
}
