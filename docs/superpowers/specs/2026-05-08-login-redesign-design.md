# Login Page Redesign — Sign Up / Sign In + Plan Mode

## Overview

Redesign the mobile app onboarding/login flow to have clear **Sign Up** and **Sign In** paths, replace the current single-flow auto-detect approach. Add a **Plan Onboarding** screen for new users and a **Plan tab** accessible from the tab bar for ongoing crop/season management.

## Current State

The `onboarding.tsx` screen has a single flow: method select (Google/Phone) → phone → OTP → auto-detect new/returning → profile (if new) → welcome → tabs.

## Goals

1. **Clear Sign Up / Sign In distinction** — two separate entry screens rather than a single unified flow.
2. **Plan Onboarding** — one-time flow after Sign Up for crop/season planning.
3. **Plan Tab** — permanent tab in the tab bar for editing/viewing crop plans.

## Architecture

### Screen Flow

```
Landing (Sign In / Sign Up)
       │
       ├── Sign In → Phone → OTP → Tabs
       │
       └── Sign Up → Phone → OTP → Profile → Plan Onboarding → Tabs
                                                         │
                                                   [One-time: season,
                                                    crops, harvest dates]
```

### Files to Modify / Create

| File | Action | Description |
|------|--------|-------------|
| `mobile/app/onboarding.tsx` | Modify | Split into `signin.tsx` and `signup.tsx`, landing stays |
| `mobile/app/(tabs)/_layout.tsx` | Modify | Add "Plan" tab |
| `mobile/app/(tabs)/plan.tsx` | Create | Plan tab screen |
| `mobile/app/plan-onboarding.tsx` | Create | One-time plan onboarding after sign up |
| `mobile/constants/translations.ts` | Modify | Add new translation keys |
| `mobile/store/index.ts` | Check | Add `currentPlan` or `seasonPlan` state |

### Landing Screen

```
┌─────────────────────────┐
│    🌾 मंडी एजेंट        │
│   Your Crop, Your Mandi  │
├─────────────────────────┤
│                         │
│  ┌───────────────────┐  │
│  │  📱 Sign In       │  │
│  │  Already a farmer? │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │  🌱 Sign Up       │  │
│  │  New to Mandi?    │  │
│  └───────────────────┘  │
│                         │
│  ─── or ───             │
│  [Continue with Google] │
│                         │
│  हिंदी | English        │
└─────────────────────────┘
```

Two large cards: **Sign In** (phone icon, "Already a farmer?") and **Sign Up** (sprout icon, "New to Mandi?"). Google button below divider. Language selector at bottom.

### Sign In Screen

Routed from landing → `/signin`. Same phone → OTP flow with "Sign In" labels. After verification:
- Existing farmer profile found → go directly to tabs
- No profile (edge case) → redirect to Sign Up

### Sign Up Screen

Routed from landing → `/signup`.

**Phone → OTP** (same components as Sign In, different labels).

**Profile step:**
- Name (text input)
- State (picker/dropdown)
- District (picker/dropdown)
- Block (picker/dropdown)
- Village (optional text input)
- Primary Crops (multi-select chips)
- Land size (number input, hectares)
- Preferred Language (Hindi/English toggle)
- Continue button

### Plan Onboarding (new screen)

After profile completion, route to `/plan-onboarding`. One-time screen. Fields:
- **Season**: Kharif | Rabi | Zaid (chip toggle)
- **Current Crops**: Multi-select from farmer's primary crops + add more
- **Expected Harvest Month**: Month picker
- **Planted Area**: per-crop land allocation (number input)
- **Save & Continue → Tabs**

### Plan Tab (new)

Accessible from tab bar (icon: calendar/seedling). Shows:
- Current season plan summary
- Crop cards (crop name, area, expected harvest, status)
- Edit button → opens plan-onboarding in edit mode
- Historical plans (previous seasons)

### State Management

Add to Zustand store:
```typescript
interface SeasonPlan {
  id: string;
  season: 'kharif' | 'rabi' | 'zaid';
  year: number;
  crops: { crop: string; area_hectares: number; expected_harvest: string }[];
  created_at: string;
  updated_at: string;
}
```

### Routes

| Path | File | Description |
|------|------|-------------|
| `/onboarding` | `onboarding.tsx` | Landing (Sign In / Sign Up) |
| `/onboarding/signin` | `signin.tsx` | Sign In flow |
| `/onboarding/signup` | `signup.tsx` | Sign Up flow |
| `/plan-onboarding` | `plan-onboarding.tsx` | One-time plan setup |
| `/(tabs)/plan` | `plan.tsx` | Plan tab |

### Tab Bar Update

Current order: Home | Prices | Cooperative | Farm | Settings
New order:     Home | Prices | Cooperative | Farm | **Plan** | Settings

Plan icon: seedling/flower emoji or a calendar icon.

## Key Decisions

- **Separate files** for signin/signup rather than conditional rendering in one file, to keep each under 300 lines.
- **Plan onboarding is one-time** but accessible from Plan tab for editing later.
- **Google OAuth** stays on landing screen, routes to either signup or signin based on whether a profile exists.
- **Zustand store** for plan state, persisted to AsyncStorage.
