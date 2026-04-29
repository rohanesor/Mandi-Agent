# Mandi-Agent Frontend Polish Design Specification

**Date:** 2026-04-15  
**Approach:** Balanced Polish (Phases 1-4)  
**Timeline:** 5-6 days (single session)  
**Target:** Production-grade UI/UX with modern + vibrant aesthetic

---

## 1. Design System

### Color Palette

**Primary Colors (Existing - Enhanced)**
- Primary Green: `#1B4332` (dark mode base)
- Accent Green: `#2D6A4F` (cards, highlights)
- Vibrant Accent: `#FFB703` (orange-yellow for CTAs, alerts)
- Secondary Accent: `#00B4D8` (light blue for data visualization)

**New Additions**
- Success: `#06D6A0` (confirmations, positive states)
- Warning: `#FF6B6B` (urgent alerts, negative states)
- Neutral Light: `#F0F4F8` (text on cards)
- Neutral Dark: `#1A1A1A` (deep blacks for contrast)
- Muted: `#889AAA` (secondary text, disabled states)

### Typography System

**Font Stack:** `Poppins` (primary), `Inter` (fallback)

| Element | Size | Weight | Line Height | Usage |
|---------|------|--------|-------------|-------|
| H1 (Page Title) | 32px | 700 | 40px | Home screen header |
| H2 (Section) | 24px | 700 | 32px | Weather, Farm details |
| H3 (Card Title) | 20px | 600 | 28px | Card headers |
| Body Large | 16px | 500 | 24px | Main content |
| Body Regular | 14px | 400 | 22px | Descriptions |
| Label | 12px | 600 | 16px | Tags, badges |
| Caption | 11px | 400 | 14px | Timestamps, hints |

### Spacing System (8px base)

```
xs: 4px    (small gaps)
sm: 8px    (component padding)
md: 12px   (internal spacing)
lg: 16px   (card gaps)
xl: 24px   (container padding)
xxl: 32px  (section spacing)
xxxl: 48px (major section gaps)
```

### Shadows & Depth

```
Elevation 1 (Cards): 
  shadowColor: rgba(0,0,0,0.08)
  shadowOffset: {width: 0, height: 2}
  shadowRadius: 8
  elevation: 2

Elevation 2 (Modals, Popups):
  shadowColor: rgba(0,0,0,0.15)
  shadowOffset: {width: 0, height: 4}
  shadowRadius: 16
  elevation: 4

Elevation 3 (Floating Actions, Overlays):
  shadowColor: rgba(0,0,0,0.25)
  shadowOffset: {width: 0, height: 8}
  shadowRadius: 24
  elevation: 8
```

### Border Radius

- None: Rectangles (map, stats boxes)
- `sm: 8px` (buttons, small components)
- `md: 12px` (cards, inputs)
- `lg: 16px` (large components, notifications)
- `xl: 20px` (modals, bottom sheets)
- `full: 9999px` (badges, avatars, pills)

---

## 2. Phase 1: Fix Critical Issues

### 2.1 Map Collision Resolution

**Current Problem:** Farmer avatars overlap when clustered on cooperative map

**Solution:**
- Implement **marker clustering library** (use custom clustering for React Native)
- Logic:
  - Within 100px radius: Show cluster badge "N farmers"
  - Zoom in to individual level on cluster tap
  - Individual farmers: Slight offset (10-15px) to prevent overlap
- Visual treatment:
  - Cluster badge: Orange background, white text, shadow elevation 2
  - Individual markers: Current avatar + light glow effect

**Implementation Details:**
```typescript
// Pseudo-code approach
const clusteredMarkers = clusterMarkers(farmers, {
  radius: 100,
  minCluster: 2
});

// Render clusters or individual markers
clusteredMarkers.map(item => 
  item.isCluster 
    ? <ClusterBadge count={item.count} />
    : <FarmerMarker farmer={item.farmer} />
)
```

### 2.2 Responsive Layout Fixes

**Container Constraints:**
- Max width: 480px (mobile), 600px (tablet)
- Padding: `xl` (24px) on all sides
- ScrollView wrapping on overflow sections

**Problem Areas Fixed:**
1. **Home/Farm page:** Wrap farm details in constrained card with proper padding
2. **Weather section:** Ensure forecast items don't wrap awkwardly; use horizontal scroll if needed
3. **Cooperative page:** Map container gets proper height constraint (60vh), list below gets proper scroll
4. **News page:** Card widths constrained, no text overflow

**Breakpoints:**
```
Mobile: < 480px
Tablet: 480px - 768px
Desktop (web): > 768px
```

### 2.3 Typography Standardization

**Implement consistent hierarchy across screens:**

```tsx
// Home Screen Example
<View style={styles.container}>
  <Text style={styles.h2}>My Farm</Text>
  <Card>
    <Text style={styles.h3}>Raju Naik</Text>
    <Text style={styles.bodySmall}>Mulbagal, Kolar District, Karnataka</Text>
  </Card>
</View>
```

**All components updated to use standardized styles from theme.ts**

---

## 3. Phase 2: Core Component Upgrades

### 3.1 Card Component Enhancement

**Current:** Simple gray background, minimal styling  
**Upgraded:**

```tsx
interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  highlight?: boolean; // For featured cards
  children: ReactNode;
}

// Visual improvements
- Default: Green background (#2D6A4F), white text, shadow elevation 1
- Elevated: Stronger shadow, lifted appearance
- Outlined: Border-only, useful for secondary actions
- Filled: Full accent color background
- highlight: Orange accent border + enhanced shadow
```

**Spacing:**
- Padding: 16px
- Border radius: 12px
- Shadow: Elevation 1 always
- Gap between cards: 16px

### 3.2 Button Component System

**Create unified button variants:**

```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}

// Variants:
- Primary: Orange background, white text, elevation 1, tap animation
- Secondary: Green border, green text, transparent background
- Tertiary: Text-only, minimal styling
- Danger: Red background for destructive actions

// Sizes:
- sm: 32px height, 12px text
- md: 40px height, 14px text (default)
- lg: 48px height, 16px text
```

**All CTAs updated** (Sign Out, Continue, Join, etc.)

### 3.3 Badge & Tag System

**New component library:**
- **Status badges:** Success (green), Warning (orange), Info (blue)
- **Price badges:** Increase (green up arrow), Decrease (red down arrow)
- **Farmer badges:** Cluster counts, confirmed status
- **Tags:** Crop types, location labels

```tsx
<Badge variant="success" label="Confirmed" size="sm" />
<PriceChange value={+12} percentage={5.2} /> // Shows: ↑ +₹12 (5.2%)
```

### 3.4 Input & Form Components

**Upgrade existing inputs:**
- Add focus states (border color change to orange)
- Add error states (red border + error message below)
- Add success states (green checkmark)
- Proper label positioning (above input)
- Placeholder text color: Muted

---

## 4. Phase 3: Depth & Vibrancy

### 4.1 Gradient System

**Hero Gradients (Section backgrounds):**
```
Home Hero: #1B4332 → #2D6A4F (subtle left-to-right)
Weather Card: #0B5345 → #1B4332 (top-to-bottom)
Cooperative: #1B4332 → #006B5C (radial from center)
```

**Accent Gradients (CTAs, highlights):**
```
Primary Gradient: #FFB703 → #FF8C42 (orange warm)
Success Gradient: #06D6A0 → #00B4D8 (green-to-blue)
```

**Implementation:**
- Use `expo-linear-gradient` for cards and backgrounds
- Apply to: Card backgrounds (subtle), CTA buttons, hero sections
- Avoid: Body text, small components (keep contrast high)

### 4.2 Visual Accents & Highlights

**Accent Placement:**
- Orange left-border on "active" cards (current farm, featured cooperative)
- Orange badge on notifications
- Glowing effects on farmer avatars (soft blue glow)
- Highlight color on data visualization (bars, charts)

**Icon Enhancements:**
- Use `lucide-react-native` icons consistently
- Color coding: Green (positive), Orange (action), Red (warning), Blue (info)
- Icon sizes: 20px (inline), 24px (buttons), 32px (headers)

### 4.3 Visual Hierarchy Refinement

**Information Architecture:**
1. **Primary Info:** Largest, brightest color (green/orange)
2. **Secondary Info:** Medium size, secondary color (blue/teal)
3. **Tertiary Info:** Small, muted color

**Application Examples:**
- Home: User name (primary) > Location (secondary) > Email (tertiary)
- Weather: Temperature (primary, 28°C) > Condition (secondary) > Details (tertiary)
- Cooperative: "24/50 Farmers" (primary) > "Co-op Formation" (secondary) > Progress steps (tertiary)

---

## 5. Phase 4: Animations & Micro-interactions

### 5.1 Transition System

**Global Transitions:**
- Page transitions: `ease-out` 250ms
- Component mounts: `ease-out` 300ms
- Tap feedback: `ease-out` 100ms (scale 0.98)

**Examples:**
```tsx
// Card press animation
<Animated.View
  style={[
    styles.card,
    {
      transform: [{scale: pressAnim}],
    }
  ]}
>
  {children}
</Animated.View>

// On press:
Animated.sequence([
  Animated.timing(pressAnim, {
    toValue: 0.98,
    duration: 100,
    useNativeDriver: true,
  }),
  Animated.timing(pressAnim, {
    toValue: 1,
    duration: 100,
    useNativeDriver: true,
  })
])
```

### 5.2 Loading States

**Skeleton loading for data:**
- Placeholder cards with animated shimmer effect
- Show while fetching weather, prices, cooperative data
- Replace with actual content smoothly

**Spinner variants:**
- Circular spinner for small operations (1-2 sec)
- Linear progress bar for longer operations
- Lottie animation for advisory voice recording

### 5.3 Gesture Interactions

**Tap Feedback:**
- All interactive elements: Scale 0.98 + opacity feedback
- Haptic feedback on important actions (join cooperative, sign out)

**Swipe Gestures:**
- Horizontal swipe to navigate between tabs (if needed)
- Swipe-to-dismiss on alerts/notifications
- Refresh gesture on pull-down

**Long Press:**
- Open context menu on farmer cards
- Copy coordinates on map long-press

### 5.4 Entrance Animations

**Screen Transitions:**
- Slide from right (forward navigation)
- Slide from left (back navigation)
- Fade in (modal screens)

**Element Animations:**
- Staggered fade-in for list items (50ms delay each)
- Scale-up for cards on initial load
- Number counter animation for statistics (e.g., "24/50" animates from 0)

---

## 6. Screen-by-Screen Improvements

### 6.1 Home/Farm Screen

**Changes:**
- Add gradient background (subtle green gradient)
- User card: Enhanced with left orange accent border, shadow elevation 2
- Farm stats: Redesigned as separate stat cards with icons (Crops 🌾, Land 📐, Location 📍)
- Each stat card: Gradient background + large number + label
- Weather section: Full gradient background, better forecast layout
- "My Crops" section: Placeholder with CTA to add crops

**Layout:**
```
┌─────────────────────────┐
│ User Card (elevated)    │
├─────────────────────────┤
│ Farm Stats (3 cards)    │
├─────────────────────────┤
│ Weather (gradient)      │
├─────────────────────────┤
│ My Crops (empty state)  │
└─────────────────────────┘
```

### 6.2 Prices Screen

**Changes:**
- Search input: Focus state with orange border, enhanced shadow
- Filter chips: Active state with orange background
- Price cards: Show current price (large, bold), trend (green/red arrow), time updated
- Price history: Simple line chart visualization (using Skia for Android/iOS, canvas for web)
- Empty state: Friendly illustration + CTA to select a mandi

**Layout:**
```
┌─────────────────────────┐
│ Search + Filters        │
├─────────────────────────┤
│ Price Card (repeating)  │
│ ↑ ₹450 (+5%)           │
│ Updated 2 hours ago     │
└─────────────────────────┘
```

### 6.3 Cooperative/Marketplace Screen

**Changes:**
- Map: Implement marker clustering, proper container sizing
- Co-op formation card: Enhanced with gradient, progress visualization (timeline with checkmarks)
- Farmer list: Better card design with avatar, name, crop type, distance, action button
- Join button: Prominent CTA with orange color, haptic feedback

**Map Clustering:**
- Cluster badge: Orange circular badge with white text "5 farmers"
- Individual markers: Avatar with light glow
- Tap to zoom/expand cluster

**Layout:**
```
┌─────────────────────────┐
│ Map (clustered)         │
├─────────────────────────┤
│ Co-op Formation Card    │
│ ┌─ Intents             │
│ ┌─ AI Negotiating      │
│ ├─ Mandi Selected      │
│ └─ Truck Booked        │
├─────────────────────────┤
│ Farmer Cards (list)     │
└─────────────────────────┘
```

### 6.4 News/Advisory Screen

**Changes:**
- News alert cards: Redesigned with gradient background, icon indicator, timestamp
- Card styling: Elevation 2, colored left-border by alert type
- Text: Better typography hierarchy, descriptions truncated with "Read more"
- Empty state: Friendly message when no news available

**Card Variants by Type:**
- **Warning:** Red-orange left border, warning icon
- **Info:** Blue left border, info icon
- **Success:** Green left border, check icon

---

## 7. Implementation Order

**Day 1-2: Phase 1 (Critical Fixes)**
1. Fix map collision + clustering
2. Standardize spacing across screens
3. Fix responsive overflow issues
4. Update typography styles

**Day 2-3: Phase 2 (Components)**
1. Upgrade Card component
2. Create Button component system
3. Add Badge/Tag system
4. Update Forms

**Day 3-4: Phase 3 (Depth & Vibrancy)**
1. Add gradients to hero sections
2. Implement accent colors
3. Enhance icons
4. Visual hierarchy refinement

**Day 4-5: Phase 4 (Animations)**
1. Add transition animations
2. Implement loading states
3. Add gesture interactions
4. Entrance animations

**Day 5-6: Polish & Testing**
1. Cross-screen consistency check
2. Performance optimization (animation frame rates)
3. Accessibility review (contrast, hit targets)
4. Device testing (various screen sizes)

---

## 8. Technical Considerations

### Dependencies
- `expo-linear-gradient` (already present) - For gradients
- `react-native-reanimated` (already present) - For animations
- `lucide-react-native` (already present) - For consistent icons

### Performance
- Use `memo()` on animated components
- Implement `shouldRasterizeIOS` for complex animated scenes
- Profile animations with React Native DevTools

### Accessibility
- Ensure touch targets are minimum 44x44px
- Color contrast: WCAG AA minimum
- Add semantic labels to images
- Test with screen readers

### Testing Strategy
- Visual regression testing on key screens
- Animation performance profiling
- Device testing: iPhone 12, iPhone 14, Android (various sizes)

---

## 9. Success Criteria

✅ **Visual:** App feels modern, vibrant, and polished  
✅ **Layout:** No collision issues on any screen  
✅ **Performance:** Animations run at 60fps  
✅ **Consistency:** All screens follow design system  
✅ **Responsive:** Works on 4-6 inch mobile, tablets, web  
✅ **Accessible:** WCAG AA compliant, proper touch targets  

---

## 10. Files to Create/Modify

**New Files:**
- `constants/shadows.ts` - Shadow definitions
- `constants/spacing.ts` - Spacing system constants
- `components/Card.tsx` - Enhanced card component
- `components/Button.tsx` - Button system
- `components/Badge.tsx` - Badge component
- `components/Skeleton.tsx` - Loading skeleton

**Modified Files:**
- All screen files (`app/(tabs)/*.tsx`)
- Theme file (`constants/theme.ts`)
- Component library enhancements

---

**End of Specification**
