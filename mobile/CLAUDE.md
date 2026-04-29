# Mandi-Agent Mobile App

A React Native/Expo mobile application for Indian farmers to get real-time market prices, AI-powered advisory, and cooperative buying/selling of agricultural produce.

## Project Structure

```
mobile/
├── app/                          # Expo Router pages
│   ├── _layout.tsx              # Root layout with LanguageProvider
│   ├── language-select.tsx       # First-launch language selection
│   ├── onboarding.tsx           # Phone/OTP login flow
│   ├── advisory.tsx             # Voice advisory screen
│   ├── (tabs)/                 # Tab navigation group
│   │   ├── _layout.tsx         # Tab bar configuration
│   │   ├── index.tsx           # Home screen
│   │   ├── prices.tsx          # Mandi prices screen
│   │   ├── cooperative.tsx     # Virtual cooperative screen
│   │   ├── farm.tsx            # Farm details screen
│   │   └── settings.tsx         # Language settings
│   └── screens/
│       └── advisory.tsx         # Detailed advisory screen
├── constants/
│   ├── languages.ts             # 8 Indian languages definition
│   ├── translations.ts          # All UI strings in 8 languages
│   └── theme.ts                # Colors, fonts, spring config
├── context/
│   └── LanguageContext.tsx      # i18n context provider
├── hooks/                       # Custom React hooks
├── services/                    # API clients
├── store/                       # Zustand state management
├── utils/
│   └── useT.ts                 # Translation hook shorthand
└── assets/fonts/               # Poppins, Inter, SpaceMono fonts
```

## Tech Stack

- **Framework**: Expo SDK 53 with React Native
- **Routing**: expo-router (file-based routing)
- **State**: Zustand + React Query
- **Animations**: react-native-reanimated
- **Styling**: StyleSheet with custom theme
- **i18n**: Custom LanguageContext with AsyncStorage persistence

## Key Features

### Multi-Language Support (8 Indian Languages)
- Hindi (hi), Tamil (ta), Telugu (te), Kannada (kn)
- Marathi (mr), Bengali (bn), Gujarati (gu), Malayalam (ml)
- Language selection on first launch, stored in AsyncStorage
- Changeable anytime from Settings tab

### Translation System
```typescript
import { useT } from '../../utils/useT';

// In any component:
const { t, code, lang } = useT();
<Text>{t('homeTab')}</Text>  // Returns translated string
```

### Available Translation Keys
- Navigation: `homeTab`, `pricesTab`, `farmTab`, `advisoryTab`, `settingsTitle`
- Advisory: `speakBtn`, `listening`, `harvestNow`, `hold`, `redirect`, `forecastPrice`, `spoilageRisk`
- Prices: `searchMandi`, `filters`, `updated`, `stateFilters`
- Cooperative: `cooperative`, `joinBundle`, `farmers`, `moreForSavings`, `totalSaving`, `yourSavings`
- Settings: `changeLang`, `langSaved`, `selectLang`, `continueBtn`

## Route Structure

| Route | File | Description |
|-------|------|-------------|
| `/language-select` | `app/language-select.tsx` | First-launch language picker |
| `/onboarding` | `app/onboarding.tsx` | Phone/OTP login |
| `/advisory` | `app/advisory.tsx` | Voice AI advisory |
| `/screens/advisory` | `app/screens/advisory.tsx` | Detailed advisory view |
| `/(tabs)` | `app/(tabs)/_layout.tsx` | Tab container |
| `/(tabs)/index` | `app/(tabs)/index.tsx` | Home screen |
| `/(tabs)/prices` | `app/(tabs)/prices.tsx` | Market prices |
| `/(tabs)/cooperative` | `app/(tabs)/cooperative.tsx` | Farmer cooperative |
| `/(tabs)/farm` | `app/(tabs)/farm.tsx` | Farm details |
| `/(tabs)/settings` | `app/(tabs)/settings.tsx` | Settings & language |

## Navigation Pattern

```typescript
import { router } from 'expo-router';

// Within screens:
router.push('/advisory');           // Navigate to advisory
router.replace('/(tabs)');         // Replace with tabs
router.push('/(tabs)/prices');      // Navigate to prices tab
router.back();                     // Go back
```

## Important Notes

### Skia Handling
- Uses `@shopify/react-native-skia` v1.5.0
- Does NOT export `useClockValue` or `useComputedValue`
- Web: Uses CanvasKit WASM from CDN
- Must check `Platform.OS !== 'web'` before using Skia components

### Hook Rules
- `useSharedValue` CANNOT be called inside useEffect
- Use `useMemo` or refs for shared values that depend on effects

### TypeScript Patterns
- Store selectors require `as unknown as` assertions
- BlockStatus: `active_bundles` is array, not number
- FarmerProfile: `created_at` is optional from API
- Price forecast: uses `predictions[].modal_price`, not `predicted_price`
- Price forecast: uses `trend` not `price_direction`
- usePriceHistory: `setPriceHistory(key, history)` takes 2 arguments

### Language Context
- Default language: 'hi' (Hindi)
- Falls back to Hindi if translation key missing
- `isLoaded` must be true before rendering routes
- `isFirstLaunch` determined by AsyncStorage check

## Commands

```bash
cd mobile

# Start development
npx expo start

# Type check
npx tsc --noEmit

# Clear cache and restart
npx expo start --clear

# Build for production
npx expo build:android
npx expo build:ios
```

## API Configuration

Environment variables (see `.env`):
- `EXPO_PUBLIC_API_URL` - Backend API endpoint
- `EXPO_PUBLIC_BHASHINI_API_KEY` - Voice recognition
- `EXPO_PUBLIC_REVERIE_KEY` / `EXPO_PUBLIC_REVERIE_APP_ID` - Voice synthesis

## Known Caveats

1. Skia web support is limited - always check `Platform.OS !== 'web'`
2. Fonts loaded async - show fallback UI during load
3. Voice features require device permissions
4. Price data requires network connectivity (offline mode planned)
