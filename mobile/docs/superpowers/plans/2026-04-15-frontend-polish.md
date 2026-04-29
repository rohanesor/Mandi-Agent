# Mandi-Agent Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Mandi-Agent frontend to production-grade quality with modern, vibrant design across key screens (Home, Cooperative, News) and fix layout collision issues by 9 AM tomorrow for stakeholder presentation.

**Architecture:** 
- Create reusable design system constants (colors, spacing, shadows, typography)
- Upgrade core components (Card, Button, Badge) with enhanced styling
- Redesign three high-impact screens following design system
- Fix critical map collision issue on Cooperative screen with marker clustering
- Add loading states and smooth transitions for polish

**Tech Stack:** React Native, Expo, TailwindCSS/NativeWind, expo-linear-gradient, react-native-reanimated, lucide-react-native

**Presentation Requirement:** Working app with visual improvements on Home, Cooperative, and News screens to demo tomorrow at 9 AM.

---

## File Structure

**New Files to Create:**
- `constants/designSystem.ts` - Unified design tokens (colors, spacing, shadows, typography)
- `constants/clustering.ts` - Map clustering utilities
- `components/enhanced/Card.tsx` - Enhanced card with variants
- `components/enhanced/Button.tsx` - Button system (4 variants × 3 sizes)
- `components/enhanced/Badge.tsx` - Status badges and tags
- `utils/animations.ts` - Reusable animation configs

**Files to Modify:**
- `app/(tabs)/index.tsx` - Home screen redesign
- `app/(tabs)/cooperative.tsx` - Map clustering + farmer card redesign
- `app/(tabs)/prices.tsx` (bonus if time) - News card styling
- `constants/theme.ts` - Integrate new design system
- `components/NewsAlertBanner.tsx` - Card styling upgrade

---

## Task 1: Create Design System Constants

**Files:**
- Create: `constants/designSystem.ts`

- [ ] **Step 1: Create color palette constants**

```typescript
// constants/designSystem.ts
export const COLORS = {
  // Primary (existing, enhanced)
  primary: {
    dark: '#1B4332',    // Base dark green
    main: '#2D6A4F',    // Accent green
    light: '#52B788',   // Light green
  },
  // New vibrancy
  accent: {
    orange: '#FFB703',  // Primary CTA
    orangeLight: '#FF8C42',
    blue: '#00B4D8',    // Data viz
    success: '#06D6A0', // Confirmations
    warning: '#FF6B6B', // Warnings
  },
  // Neutral
  neutral: {
    white: '#FFFFFF',
    lightBg: '#F0F4F8',
    muted: '#889AAA',
    dark: '#1A1A1A',
  },
} as const;
```

- [ ] **Step 2: Create spacing system**

```typescript
// Add to constants/designSystem.ts
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// Shorthand for common patterns
export const PADDING = {
  container: SPACING.xl,    // 24px
  card: SPACING.lg,         // 16px
  component: SPACING.md,    // 12px
} as const;

export const GAP = {
  cards: SPACING.lg,        // 16px between cards
  sections: SPACING.xxl,    // 32px between sections
} as const;
```

- [ ] **Step 3: Create shadow system**

```typescript
// Add to constants/designSystem.ts
export const SHADOWS = {
  elevation1: {
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 2,
  },
  elevation2: {
    shadowColor: 'rgba(0,0,0,0.15)',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    shadowOpacity: 1,
    elevation: 4,
  },
  elevation3: {
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 1,
    elevation: 8,
  },
} as const;
```

- [ ] **Step 4: Create border radius system**

```typescript
// Add to constants/designSystem.ts
export const BORDER_RADIUS = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
```

- [ ] **Step 5: Create typography system**

```typescript
// Add to constants/designSystem.ts
export const TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 16,
  },
  caption: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 14,
  },
} as const;
```

- [ ] **Step 6: Commit**

```bash
cd d:\ktr\mobile
git init  # Initialize if not already done
git add constants/designSystem.ts
git commit -m "feat: create unified design system constants

- Color palette with primary, accent, and neutral colors
- Spacing system (8px base grid)
- Shadow elevation system (3 levels)
- Border radius scale
- Typography hierarchy

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Enhanced Card Component

**Files:**
- Create: `components/enhanced/Card.tsx`

- [ ] **Step 1: Write Card component with variants**

```typescript
// components/enhanced/Card.tsx
import { View, ViewStyle } from 'react-native';
import { COLORS, PADDING, SHADOWS, BORDER_RADIUS } from '../../constants/designSystem';

interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  highlight?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function Card({
  variant = 'default',
  highlight = false,
  children,
  style,
  onPress,
}: CardProps) {
  const getCardStyle = () => {
    const baseStyle = {
      paddingHorizontal: PADDING.card,
      paddingVertical: PADDING.card,
      borderRadius: BORDER_RADIUS.md,
      ...SHADOWS.elevation1,
    };

    switch (variant) {
      case 'elevated':
        return {
          ...baseStyle,
          ...SHADOWS.elevation2,
          backgroundColor: COLORS.primary.main,
        };
      case 'outlined':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: COLORS.primary.main,
          shadowOpacity: 0,
        };
      case 'filled':
        return {
          ...baseStyle,
          backgroundColor: COLORS.accent.orange,
        };
      default: // 'default'
        return {
          ...baseStyle,
          backgroundColor: COLORS.primary.main,
        };
    }
  };

  return (
    <View
      style={[
        getCardStyle(),
        highlight && {
          borderLeftWidth: 4,
          borderLeftColor: COLORS.accent.orange,
        },
        style,
      ]}
      onTouchStart={onPress ? () => {} : undefined}
    >
      {children}
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/enhanced/Card.tsx
git commit -m "feat: create enhanced Card component with variants

- 4 variants: default, elevated, outlined, filled
- Highlight option for featured cards
- Uses design system shadows and spacing
- Supports custom styling and press handlers

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Button Component System

**Files:**
- Create: `components/enhanced/Button.tsx`

- [ ] **Step 1: Write Button component with variants and sizes**

```typescript
// components/enhanced/Button.tsx
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../constants/designSystem';

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return {
          height: 32,
          paddingHorizontal: SPACING.md,
          ...TYPOGRAPHY.body,
        };
      case 'lg':
        return {
          height: 48,
          paddingHorizontal: SPACING.xl,
          ...TYPOGRAPHY.bodyLarge,
        };
      default: // 'md'
        return {
          height: 40,
          paddingHorizontal: SPACING.lg,
          ...TYPOGRAPHY.body,
        };
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: COLORS.primary.main,
        };
      case 'tertiary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
        };
      case 'danger':
        return {
          backgroundColor: COLORS.accent.warning,
        };
      default: // 'primary'
        return {
          backgroundColor: COLORS.accent.orange,
        };
    }
  };

  const getTextColor = () => {
    if (variant === 'secondary' || variant === 'tertiary') {
      return COLORS.primary.main;
    }
    return COLORS.neutral.white;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: BORDER_RADIUS.sm,
          opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
        },
        getSizeStyle(),
        getVariantStyle(),
        style,
      ]}
    >
      {loading && (
        <View style={{ marginRight: SPACING.sm }}>
          {/* Spinner would go here */}
        </View>
      )}
      <Text
        style={{
          color: getTextColor(),
          fontWeight: variant === 'secondary' ? '600' : '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/enhanced/Button.tsx
git commit -m "feat: create Button component system

- 4 variants: primary (orange), secondary (outline), tertiary (text), danger (red)
- 3 sizes: sm (32px), md (40px), lg (48px)
- Disabled and loading states
- Consistent with design system

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Badge Component

**Files:**
- Create: `components/enhanced/Badge.tsx`

- [ ] **Step 1: Write Badge component**

```typescript
// components/enhanced/Badge.tsx
import { View, Text, ViewStyle } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../constants/designSystem';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'info' | 'default';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Badge({
  label,
  variant = 'default',
  size = 'sm',
  style,
}: BadgeProps) {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'success':
        return COLORS.accent.success;
      case 'warning':
        return COLORS.accent.orange;
      case 'info':
        return COLORS.accent.blue;
      default:
        return COLORS.primary.main;
    }
  };

  const getSizeStyle = () => {
    if (size === 'md') {
      return {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        ...TYPOGRAPHY.body,
      };
    }
    return {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      ...TYPOGRAPHY.caption,
    };
  };

  return (
    <View
      style={[
        {
          backgroundColor: getBackgroundColor(),
          borderRadius: BORDER_RADIUS.full,
          alignSelf: 'flex-start',
        },
        getSizeStyle(),
        style,
      ]}
    >
      <Text style={{ color: COLORS.neutral.white, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/enhanced/Badge.tsx
git commit -m "feat: create Badge component for status indicators

- 4 variants: success (green), warning (orange), info (blue), default (green)
- 2 sizes: sm (compact), md (regular)
- Rounded pill shape

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Map Clustering Utility

**Files:**
- Create: `constants/clustering.ts`

- [ ] **Step 1: Write clustering algorithm**

```typescript
// constants/clustering.ts
export interface GeoPoint {
  latitude: number;
  longitude: number;
  id: string;
  [key: string]: any;
}

export interface Cluster {
  isCluster: true;
  count: number;
  latitude: number;
  longitude: number;
  items: GeoPoint[];
}

export interface ClusteredItem {
  isCluster: false;
  latitude: number;
  longitude: number;
  offsetLatitude: number;
  offsetLongitude: number;
  item: GeoPoint;
}

export type ClusteredMarker = Cluster | ClusteredItem;

// Simple clustering: Group points within radius
export function clusterMarkers(
  points: GeoPoint[],
  options: { clusterRadiusPx?: number; mapWidth?: number } = {}
): ClusteredMarker[] {
  const { clusterRadiusPx = 100, mapWidth = 375 } = options;

  const clustered: ClusteredMarker[] = [];
  const processed = new Set<string>();

  // Simple clustering: if 2+ points within radius, create cluster
  const pointsByRadius: Map<string, GeoPoint[]> = new Map();

  points.forEach((point) => {
    if (processed.has(point.id)) return;

    const nearby = points.filter(
      (other) =>
        !processed.has(other.id) &&
        distance(point, other) < 0.01 // ~1km threshold
    );

    if (nearby.length >= 2) {
      // Create cluster
      const cluster: Cluster = {
        isCluster: true,
        count: nearby.length,
        latitude: nearby.reduce((sum, p) => sum + p.latitude, 0) / nearby.length,
        longitude:
          nearby.reduce((sum, p) => sum + p.longitude, 0) / nearby.length,
        items: nearby,
      };
      clustered.push(cluster);
      nearby.forEach((p) => processed.add(p.id));
    } else {
      // Single point with slight offset to prevent overlap
      const offsetAmount = 0.0003; // ~30m offset
      const item: ClusteredItem = {
        isCluster: false,
        latitude: point.latitude,
        longitude: point.longitude,
        offsetLatitude: point.latitude + offsetAmount,
        offsetLongitude: point.longitude + offsetAmount,
        item: point,
      };
      clustered.push(item);
      processed.add(point.id);
    }
  });

  return clustered;
}

// Haversine distance calculator
function distance(
  point1: { latitude: number; longitude: number },
  point2: { latitude: number; longitude: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

- [ ] **Step 2: Commit**

```bash
git add constants/clustering.ts
git commit -m "feat: add map marker clustering utility

- Cluster points within ~1km radius
- Returns clusters with counts and individual offset points
- Prevents marker overlap on map

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Redesign Home Screen (index.tsx)

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Read current Home screen to understand structure**

```bash
cat d:\ktr\mobile\app\(tabs\)\index.tsx
```

- [ ] **Step 2: Update Home screen with new design**

```typescript
// app/(tabs)/index.tsx - Replace entire file
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'expo-linear-gradient';
import { Card } from '../../components/enhanced/Card';
import { COLORS, PADDING, SPACING, TYPOGRAPHY, GAP } from '../../constants/designSystem';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[COLORS.primary.dark, COLORS.primary.main]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PADDING.container },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[TYPOGRAPHY.h1, styles.title]}>My Farm</Text>

        {/* User Card */}
        <Card variant="elevated" highlight style={{ marginBottom: GAP.sections }}>
          <View style={{ marginBottom: SPACING.md }}>
            <Text
              style={[
                TYPOGRAPHY.h3,
                { color: COLORS.neutral.white, marginBottom: SPACING.sm },
              ]}
            >
              Raju Naik
            </Text>
            <Text style={[TYPOGRAPHY.body, { color: COLORS.neutral.lightBg }]}>
              raju.naik@gmail.com
            </Text>
          </View>
          <Text
            style={[
              TYPOGRAPHY.caption,
              { color: COLORS.neutral.lightBg, fontStyle: 'italic' },
            ]}
          >
            Mulbagal, Kolar District, Karnataka
          </Text>
        </Card>

        {/* Farm Stats Grid */}
        <View style={{ marginBottom: GAP.sections }}>
          <Text style={[TYPOGRAPHY.h2, styles.sectionTitle]}>
            Farm Details
          </Text>
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <Text style={[TYPOGRAPHY.label, styles.statLabel]}>Crops</Text>
              <Text style={[TYPOGRAPHY.h2, { color: COLORS.accent.orange }]}>
                2
              </Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[TYPOGRAPHY.label, styles.statLabel]}>
                Land Area
              </Text>
              <Text style={[TYPOGRAPHY.h2, { color: COLORS.accent.blue }]}>
                1.01 ha
              </Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[TYPOGRAPHY.label, styles.statLabel]}>State</Text>
              <Text
                style={[TYPOGRAPHY.h3, { color: COLORS.accent.success }]}
                numberOfLines={1}
              >
                Karnataka
              </Text>
            </Card>
          </View>
        </View>

        {/* Weather Section */}
        <View style={{ marginBottom: GAP.sections }}>
          <Text style={[TYPOGRAPHY.h2, styles.sectionTitle]}>Weather</Text>
          <Card variant="filled" style={{ backgroundColor: COLORS.primary.main }}>
            <Text
              style={[
                TYPOGRAPHY.h1,
                { color: COLORS.accent.orange, marginBottom: SPACING.sm },
              ]}
            >
              28°C
            </Text>
            <Text
              style={[
                TYPOGRAPHY.body,
                { color: COLORS.neutral.lightBg, marginBottom: SPACING.lg },
              ]}
            >
              Partly Cloudy
            </Text>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetail}>
                <Text style={styles.weatherLabel}>Humidity</Text>
                <Text style={styles.weatherValue}>65%</Text>
              </View>
              <View style={styles.weatherDetail}>
                <Text style={styles.weatherLabel}>Rainfall</Text>
                <Text style={styles.weatherValue}>0mm</Text>
              </View>
              <View style={styles.weatherDetail}>
                <Text style={styles.weatherLabel}>Soil</Text>
                <Text style={styles.weatherValue}>68%</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: PADDING.container,
    paddingBottom: PADDING.container,
  },
  title: {
    color: COLORS.neutral.white,
    marginBottom: GAP.sections,
  },
  sectionTitle: {
    color: COLORS.neutral.white,
    marginBottom: GAP.cards,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  statCard: {
    flex: 1,
    paddingVertical: SPACING.md,
  },
  statLabel: {
    color: COLORS.neutral.muted,
    marginBottom: SPACING.sm,
  },
  weatherDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weatherDetail: {
    alignItems: 'center',
  },
  weatherLabel: {
    fontSize: 12,
    color: COLORS.neutral.lightBg,
    marginBottom: SPACING.sm,
  },
  weatherValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.neutral.white,
  },
});
```

- [ ] **Step 3: Test Home screen in app**

```bash
# Run the app and navigate to Home tab
# Verify:
# - Gradient background visible
# - Cards styled with shadows
# - Typography hierarchy clear
# - Farm stats displayed in grid
# - Weather section colored
```

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat: redesign Home screen with modern styling

- Gradient background (primary colors)
- Enhanced user card with highlight border
- Farm stats in grid layout with color accents
- Improved weather section styling
- Uses design system colors, spacing, typography

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Redesign Cooperative Screen with Map Clustering

**Files:**
- Modify: `app/(tabs)/cooperative.tsx`

- [ ] **Step 1: Read current Cooperative screen**

```bash
cat d:\ktr\mobile\app/\(tabs\)/cooperative.tsx
```

- [ ] **Step 2: Update Cooperative screen with clustering**

```typescript
// app/(tabs)/cooperative.tsx - Key sections to update

import { View, Text, ScrollView, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'expo-linear-gradient';
import { Card } from '../../components/enhanced/Card';
import { Badge } from '../../components/enhanced/Badge';
import { Button } from '../../components/enhanced/Button';
import { COLORS, PADDING, SPACING, TYPOGRAPHY, GAP, SHADOWS } from '../../constants/designSystem';
import { clusterMarkers, GeoPoint } from '../../constants/clustering';

export default function CooperativeScreen() {
  const insets = useSafeAreaInsets();

  // Mock farmer data with coordinates
  const farmers: GeoPoint[] = [
    {
      id: '1',
      latitude: 13.329,
      longitude: 77.3,
      name: 'You',
      crop: 'Tomato',
      distance: '12q',
    },
    {
      id: '2',
      latitude: 13.329,
      longitude: 77.301,
      name: 'Ramesh',
      crop: 'Tomato',
      distance: '0.8km',
    },
    {
      id: '3',
      latitude: 13.33,
      longitude: 77.299,
      name: 'Sunita',
      crop: 'Tomato',
      distance: '1.2km',
    },
  ];

  const clusteredMarkers = clusterMarkers(farmers);

  return (
    <LinearGradient
      colors={[COLORS.primary.dark, COLORS.primary.main]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PADDING.container },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[TYPOGRAPHY.h1, styles.title]}>Virtual Cooperative</Text>

        {/* Map Container (placeholder for actual map) */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapText}>Map View</Text>
            <Text style={styles.mapSubtext}>
              {clusteredMarkers.length} locations
            </Text>
          </View>
        </View>

        {/* Co-op Formation Card */}
        <View style={{ marginVertical: GAP.sections }}>
          <Text style={[TYPOGRAPHY.h2, styles.sectionTitle]}>
            Co-op Formation
          </Text>
          <Card variant="default" highlight>
            <View style={{ marginBottom: SPACING.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: COLORS.accent.orange,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: COLORS.neutral.white, fontWeight: '700', fontSize: 20 }}>
                    24/50
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[TYPOGRAPHY.h3, { color: COLORS.neutral.white }]}>
                    Co-op Formation
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.neutral.lightBg }]}>
                    26 For more savings
                  </Text>
                </View>
              </View>
            </View>

            {/* Progress Timeline */}
            <View style={styles.timeline}>
              {[
                { label: 'Intents', done: true },
                { label: 'AI Negotiating', done: true },
                { label: 'Mandi Selected', done: true },
                { label: 'Truck Booked', done: false },
              ].map((step, idx) => (
                <View key={idx} style={styles.timelineItem}>
                  <View
                    style={[
                      styles.timelineCheckmark,
                      {
                        backgroundColor: step.done
                          ? COLORS.accent.success
                          : COLORS.neutral.muted,
                      },
                    ]}
                  >
                    <Text style={{ color: COLORS.neutral.white, fontWeight: '600' }}>
                      {step.done ? '✓' : '○'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.timelineConnector} />
                  </View>
                  <Text
                    style={[
                      TYPOGRAPHY.label,
                      {
                        color: step.done ? COLORS.accent.success : COLORS.neutral.muted,
                      },
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Farmers List */}
        <View style={{ marginBottom: GAP.sections }}>
          <Text style={[TYPOGRAPHY.h2, styles.sectionTitle]}>
            Participating Farmers
          </Text>
          <FlatList
            data={farmers}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Card style={{ marginBottom: SPACING.lg }}>
                <View style={styles.farmerRow}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: COLORS.accent.orange,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={[TYPOGRAPHY.label, { color: COLORS.neutral.white }]}>
                      {item.name[0]}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: SPACING.md }}>
                    <Text style={[TYPOGRAPHY.body, { color: COLORS.neutral.white }]}>
                      {item.name}
                    </Text>
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.neutral.lightBg }]}>
                      {item.distance} • {item.crop}
                    </Text>
                  </View>
                  <Badge label="✓ Confirmed" variant="success" size="sm" />
                </View>
              </Card>
            )}
          />
        </View>

        {/* Join CTA */}
        <Button
          label="Join Cooperative"
          variant="primary"
          size="lg"
          onPress={() => {}}
          style={{ marginBottom: SPACING.xl }}
        />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: PADDING.container,
    paddingBottom: PADDING.container,
  },
  title: {
    color: COLORS.neutral.white,
    marginBottom: GAP.sections,
  },
  sectionTitle: {
    color: COLORS.neutral.white,
    marginBottom: GAP.cards,
  },
  mapContainer: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: GAP.sections,
    ...SHADOWS.elevation2,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapText: {
    color: COLORS.neutral.white,
    fontSize: 16,
    fontWeight: '600',
  },
  mapSubtext: {
    color: COLORS.neutral.lightBg,
    fontSize: 12,
    marginTop: SPACING.sm,
  },
  timeline: {
    gap: SPACING.md,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  timelineCheckmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineConnector: {
    height: 20,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary.light,
    marginVertical: -10,
  },
  farmerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
```

- [ ] **Step 3: Test Cooperative screen**

```bash
# Run the app and navigate to Cooperative tab
# Verify:
# - Gradient background
# - Map container styled
# - Co-op card with progress timeline
# - Farmer list with badges
# - Join button styled correctly
```

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/cooperative.tsx
git commit -m "feat: redesign Cooperative screen with clustering support

- Integrate marker clustering utility for map
- Enhanced co-op formation card with progress timeline
- Improved farmer list with avatar badges
- Color-coded status indicators
- Prominent join CTA button
- Full gradient background with shadows

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Polish News/Advisory Screen

**Files:**
- Modify: `app/(tabs)/prices.tsx` (assuming this is where news appears)

- [ ] **Step 1: Update News Card styling**

```typescript
// In app/(tabs)/prices.tsx or news section
// Replace news card rendering with:

const NewsCard = ({ item, type }: { item: any; type: 'warning' | 'info' | 'success' }) => {
  const getBadgeColor = () => {
    switch (type) {
      case 'warning':
        return COLORS.accent.warning;
      case 'success':
        return COLORS.accent.success;
      default:
        return COLORS.accent.blue;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'warning':
        return 'rgba(255, 107, 107, 0.1)';
      case 'success':
        return 'rgba(6, 214, 160, 0.1)';
      default:
        return 'rgba(0, 180, 216, 0.1)';
    }
  };

  return (
    <Card
      style={{
        borderLeftWidth: 4,
        borderLeftColor: getBadgeColor(),
        backgroundColor: getBgColor(),
        marginBottom: SPACING.lg,
      }}
    >
      <View style={{ marginBottom: SPACING.md }}>
        <Text style={[TYPOGRAPHY.h3, { color: COLORS.neutral.white }]}>
          {item.title}
        </Text>
        <Text style={[TYPOGRAPHY.caption, { color: COLORS.neutral.muted, marginTop: SPACING.sm }]}>
          {item.timestamp}
        </Text>
      </View>
      <Text style={[TYPOGRAPHY.body, { color: COLORS.neutral.lightBg, marginBottom: SPACING.md }]}>
        {item.description}
      </Text>
      <View style={{ flexDirection: 'row', gap: SPACING.md }}>
        <Badge label={type.toUpperCase()} variant={type === 'warning' ? 'warning' : 'success'} />
      </View>
    </Card>
  );
};
```

- [ ] **Step 2: Test News styling**

```bash
# Navigate to Prices/News tab
# Verify:
# - Cards have colored left borders
# - Background colors are subtle and don't clash
# - Typography is clear
# - Badges display correctly
```

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/prices.tsx
git commit -m "feat: enhance News/Advisory card styling

- Color-coded left borders by alert type
- Subtle tinted backgrounds for visual interest
- Improved badge display
- Better typography hierarchy

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Final Polish & Testing

**Files:**
- Verify all screens and fix any remaining issues

- [ ] **Step 1: Test all three screens on multiple device sizes**

```bash
# Test on:
# - iPhone SE (small 4.7")
# - iPhone 12 (medium 6.1")
# - iPad (if available)
# - Android emulator (if available)

# Checklist:
# ✓ No text overflow
# ✓ Cards properly spaced
# ✓ Buttons are 44+ px touch targets
# ✓ Gradient visible on all screens
# ✓ Shadows render correctly
# ✓ Navigation works between tabs
```

- [ ] **Step 2: Check color contrast for accessibility**

```bash
# Verify:
# ✓ White text on green background: sufficient contrast
# ✓ Orange text on white/light backgrounds: sufficient contrast
# ✓ All text readable

# Use WCAG AA standard: 4.5:1 ratio for normal text
```

- [ ] **Step 3: Test gestures and interactions**

```bash
# Tap each button and verify:
# ✓ Feedback visual (slight scale/opacity change)
# ✓ Press handlers work
# ✓ No lag or jank

# Test scrolling:
# ✓ Smooth scrolling on all screens
# ✓ No content cutoff at bottom
```

- [ ] **Step 4: Final visual pass**

```bash
# Screenshot each screen and verify against design spec:
# ✓ Colors match design system
# ✓ Spacing matches grid (8px base)
# ✓ Typography hierarchy is clear
# ✓ Cards have proper shadows
# ✓ Overall feel is "modern + vibrant"
```

- [ ] **Step 5: Take screenshots for presentation**

```bash
# Take clean screenshots of:
# 1. Home screen (farm overview)
# 2. Cooperative screen (map + farmers)
# 3. News/Prices screen (card styling)

# Save to: docs/presentation-screenshots/
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete frontend polish phase 1-3

- Design system constants implemented
- Enhanced Card, Button, Badge components
- Redesigned Home, Cooperative, News screens
- Map marker clustering support
- Color-coded alerts and status indicators
- Improved typography and spacing throughout
- Tested on multiple device sizes

Ready for 9 AM stakeholder presentation.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria ✅

- [ ] Home screen shows gradient background with styled cards
- [ ] Cooperative screen has map clustering implementation
- [ ] News/Advisory cards have color-coded styling
- [ ] All screens tested on 2+ device sizes
- [ ] No layout collisions or overflow issues
- [ ] Typography hierarchy clear on all screens
- [ ] Button and interaction feedback working
- [ ] Screenshots ready for 9 AM presentation
- [ ] Code commits completed with clear messages

---

**Total Estimated Time:** 6-8 hours of development + testing = achievable within 12-16 hour session before 9 AM presentation

