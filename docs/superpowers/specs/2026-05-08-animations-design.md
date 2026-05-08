# App-Wide Animation System — Design Doc

## Overview

Add subtle, nature-themed animations across all screens: animated background (grass sway + wind particles), page transitions, hover effects (web), icon animations, and an updated loading screen with smooth crossfade.

## Current State

- Minimal animations: some buttons use `react-native-reanimated` spring scale on press
- Loading: `AgriculturalLoader` with 🌾 emoji text, a progress bar, no exit transition
- Page transitions: Expo Router default (none/crossfade)
- No hover effects
- No background animations

## Goals

1. **AnimatedBackground** — reusable subtle grass + wind backdrop on every screen
2. **Loading screen** — animated wheat icons, spring progress, crossfade → app
3. **Page transitions** — per-route animated transitions via Stack screen options
4. **Hover effects (web)** — card/button scale + shadow lift via `Platform.OS === 'web'`
5. **Tab icon animation** — spring scale on active tab switch
6. **Success feedback** — checkmark scale + fade reveal
7. **ScrollAnimatedHeader** — optional: header that shrinks/fades on scroll

## Architecture

### File Structure

```
mobile/
├── components/
│   ├── AnimatedBackground.tsx     ← Grass sway + wind particles
│   ├── AnimatedLoadingScreen.tsx  ← New loading with wheat bounce + crossfade
│   ├── AnimatedIcon.tsx           ← Reusable icon with spring scale
│   └── HoverCard.tsx              ← Web-only hover scale + shadow
├── hooks/
│   └── usePageTransition.ts       ← Hook for transition config per route
├── app/
│   └── _layout.tsx                ← Replace AgriculturalLoader with AnimatedLoadingScreen
└── constants/
    └── theme.ts                   ← Add animation durations, spring configs
```

### AnimatedBackground

```tsx
// Wraps content with translucent animated layer
<AnimatedBackground opacity={0.12}>
  {/* Grass blades — reanimated withRepeat(withSequence(withTiming(sway))) */}
  {/* Wind particles — floating dots, random Y, left-to-right */}
  {children}
</AnimatedBackground>
```

- Rendered as absolute-positioned overlay behind content
- `pointerEvents="none"` so it doesn't block interaction
- Grass: 5-7 thin curved lines at bottom, staggered animation timing
- Wind: 8-12 tiny circles, random sizes (2-4px), moving left-to-right at varying speeds
- Uses `useSharedValue` + `useAnimatedStyle` for each blade/particle
- `opacity: 0.12` for subtlety

### AnimatedLoadingScreen

Replaces current `AgriculturalLoader`:

```
┌────────────────────────┐
│                        │
│   🌾  🌾  🌾           │  ← wheat icons bounce with stagger
│                        │
│   Mandi Agent          │  ← fade in
│   आपका खेत, आपकी कमाई  │  ← slide up
│                        │
│   ▓▓▓▓▓▓░░░░ 60%      │  ← spring progress
│   Loading...           │
│                        │
└────────────────────────┘
```

- 3 wheat emojis, staggered `withRepeat(spring)` bounce
- Title fades in (`withTiming`, 800ms)
- Subtitle slides up from below (`withTiming`, 600ms, delay 200ms)
- Progress bar: spring-based fill
- On complete: content fades out, app fades in (crossfade, 400ms)

### Page Transitions

Configured in `_layout.tsx` Stack.Screen options:

| Screen | Animation | Config |
|--------|-----------|--------|
| `language-select` | fade | `{ animation: 'fade' }` |
| `onboarding` | fade + scale | Custom: scale 0.95→1, opacity 0→1 |
| `(tabs)` | none (constant) | `{ animation: 'none' }` |
| `screens/advisory` | slide from bottom | `{ animation: 'slide_from_bottom' }` |
| `advisory` | slide from bottom | `{ animation: 'slide_from_bottom' }` |
| `plan-onboarding` | slide from right | `{ animation: 'slide_from_right' }` |

Additional: wrap root `AnimatedView` with entering/exiting animations for app mount crossfade.

### Hover Effects (Web)

```tsx
// HoverCard component — wraps any Pressable/Touchable
<HoverCard scale={1.02} shadowElevation={4}>
  {children}
</HoverCard>
```

- Uses `onPointerEnter` / `onPointerLeave` (web Pointer Events)
- Scale from 1.0 → 1.02 via `withSpring`
- Shadow elevation from 0 → 4
- Only renders on `Platform.OS === 'web'`, passes through on native
- Apply to: action cards (onboarding), price cards, cooperative cards, settings rows

### Tab Icon Animation

In `(tabs)/_layout.tsx`:
- Active tab icon: scale 1.0 → 1.15 via spring on mount
- Use `useAnimatedStyle` with `withSpring` triggered by `focused` prop

### Success Feedback

```tsx
// AnimatedCheckmark — celebratory animation
<AnimatedCheckmark onComplete={() => {}} />
```

- Scale 0 → 1 with spring bounce
- Rotate -90° → 0°
- Checkmark path drawn with `withTiming` stroke-dashoffset
- Used on: profile complete, plan saved, OTP verified, bundle joined

## Implementation Order

1. Constants — add spring configs, durations
2. `AnimatedBackground` — grass + wind component
3. `AnimatedLoadingScreen` — wheat bounce + crossfade
4. Integrate into `_layout.tsx` (replace AgriculturalLoader)
5. Page transitions — update Stack.Screen options
6. `HoverCard` — web-only hover effect
7. Apply hover to card components
8. Tab icon spring animation
9. `AnimatedCheckmark` — success feedback
10. Apply checkmark to onboarding complete, plan saved

## Key Decisions

- **AnimatedBackground uses `pointerEvents="none"`** — never blocks interaction
- **HoverCard is a no-op on native** — zero overhead on mobile
- **Crossfade uses opacity transitions** — simplest approach, works on both platforms
- **Stagger delays are proportional** — not hardcoded, based on index
- **`useSharedValue` for all animated values** — 60fps on UI thread
