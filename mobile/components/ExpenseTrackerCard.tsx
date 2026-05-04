import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const EXPENSE_KEY = '@mandiagent:expenses';

type Expense = {
  id: string;
  crop: string;
  category: 'seed' | 'fertilizer' | 'labor' | 'pesticide' | 'irrigation' | 'other';
  amount: number;
  date: string;
  note: string;
};

const CATEGORIES = [
  { key: 'seed', emoji: '🌱', label: 'Seed' },
  { key: 'fertilizer', emoji: '🧪', label: 'Fertilizer' },
  { key: 'labor', emoji: '👷', label: 'Labor' },
  { key: 'pesticide', emoji: '☠️', label: 'Pesticide' },
  { key: 'irrigation', emoji: '💧', label: 'Irrigation' },
  { key: 'other', emoji: '📦', label: 'Other' },
];

const CROPS = ['Tomato', 'Onion', 'Potato', 'Chilli', 'Rice', 'Wheat', 'Mango'];

export default function ExpenseTrackerCard() {
  const { t } = useT();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newExpense, setNewExpense] = useState({
    crop: 'Tomato',
    category: 'seed' as Expense['category'],
    amount: '',
    note: '',
  });

  useState(() => {
    AsyncStorage.getItem(EXPENSE_KEY).then((raw) => {
      if (raw) setExpenses(JSON.parse(raw));
    });
  });

  const addExpense = async () => {
    if (!newExpense.amount || isNaN(Number(newExpense.amount))) return;
    const expense: Expense = {
      id: Date.now().toString(),
      crop: newExpense.crop,
      category: newExpense.category,
      amount: Number(newExpense.amount),
      date: new Date().toISOString().split('T')[0],
      note: newExpense.note,
    };
    const updated = [expense, ...expenses];
    setExpenses(updated);
    await AsyncStorage.setItem(EXPENSE_KEY, JSON.stringify(updated));
    setNewExpense({ crop: 'Tomato', category: 'seed', amount: '', note: '' });
    setShowForm(false);
  };

  const deleteExpense = async (id: string) => {
    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    await AsyncStorage.setItem(EXPENSE_KEY, JSON.stringify(updated));
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    total: expenses.filter((e) => e.category === cat.key).reduce((s, e) => s + e.amount, 0),
  }));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>💰 Expense Tracker</Text>
        <Text style={styles.total}>₹{totalExpenses.toLocaleString()}</Text>
      </View>

      <View style={styles.categoryRow}>
        {byCategory.map((cat) => (
          <View key={cat.key} style={styles.catItem}>
            <Text style={styles.catEmoji}>{cat.emoji}</Text>
            <Text style={styles.catAmount}>₹{cat.total.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.label}>Crop</Text>
          <View style={styles.cropRow}>
            {CROPS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.cropPill, newExpense.crop === c && styles.cropPillActive]}
                onPress={() => setNewExpense((p) => ({ ...p, crop: c }))}
              >
                <Text style={[styles.cropPillText, newExpense.crop === c && styles.cropPillTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.cropRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catPill, newExpense.category === cat.key && styles.catPillActive]}
                onPress={() => setNewExpense((p) => ({ ...p, category: cat.key as Expense['category'] }))}
              >
                <Text style={styles.catPillText}>{cat.emoji} {cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Amount (₹)</Text>
          <TextInput
            style={styles.input}
            value={newExpense.amount}
            onChangeText={(v) => setNewExpense((p) => ({ ...p, amount: v }))}
            keyboardType="numeric"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={styles.input}
            value={newExpense.note}
            onChangeText={(v) => setNewExpense((p) => ({ ...p, note: v }))}
            placeholderTextColor={COLORS.muted}
          />

          <TouchableOpacity style={styles.addBtn} onPress={addExpense}>
            <Text style={styles.addBtnText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.addToggle} onPress={() => setShowForm(!showForm)}>
        <Text style={styles.addToggleText}>{showForm ? 'Cancel' : '+ Add Expense'}</Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        {expenses.slice(0, 8).map((e) => (
          <View key={e.id} style={styles.expenseItem}>
            <View style={styles.expenseHeader}>
              <Text style={styles.expenseCrop}>{e.crop}</Text>
              <TouchableOpacity onPress={() => deleteExpense(e.id)}>
                <Text style={styles.deleteBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.expenseCat}>{CATEGORIES.find((c) => c.key === e.category)?.emoji} {e.category}</Text>
            <Text style={styles.expenseAmount}>₹{e.amount.toLocaleString()}</Text>
            <Text style={styles.expenseDate}>{e.date}</Text>
            {e.note && <Text style={styles.expenseNote}>{e.note}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  total: { color: COLORS.harvest, fontFamily: FONTS.bold, fontSize: 18 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catItem: { flex: 1, minWidth: 70, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 8, alignItems: 'center' },
  catEmoji: { fontSize: 18 },
  catAmount: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  form: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 8 },
  label: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  cropRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cropPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  cropPillActive: { backgroundColor: COLORS.harvest },
  cropPillText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11 },
  cropPillTextActive: { color: COLORS.night, fontFamily: FONTS.medium },
  catPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  catPillActive: { backgroundColor: COLORS.canopy },
  catPillText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.white, fontFamily: FONTS.body, fontSize: 13 },
  addBtn: { backgroundColor: COLORS.harvest, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  addToggle: { alignItems: 'center', paddingVertical: 6 },
  addToggleText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 13 },
  expenseItem: { width: 140, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginRight: 8 },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  expenseCrop: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 12 },
  deleteBtn: { color: '#F87171', fontSize: 12 },
  expenseCat: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, marginTop: 4 },
  expenseAmount: { color: COLORS.harvest, fontFamily: FONTS.bold, fontSize: 14, marginTop: 4 },
  expenseDate: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  expenseNote: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 10, marginTop: 2, fontStyle: 'italic' },
});
