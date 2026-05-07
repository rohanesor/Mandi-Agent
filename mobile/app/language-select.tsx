import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity,
  FlatList, StatusBar, Dimensions, Pressable, Platform
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
  withSequence, interpolate, Easing,
  runOnJS
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { LANGUAGES } from '../constants/languages'
import { useLang } from '../context/LanguageContext'
import { COLORS, SPRING } from '../constants/theme'

const { width: W, height: H } = Dimensions.get('window')

export default function LanguageSelectScreen() {
  const router = useRouter()
  const { setCode } = useLang()
  const [picked, setPicked] = useState<string | null>(null)

  const titleY = useSharedValue(-20)
  const titleOp = useSharedValue(0)
  const subY = useSharedValue(20)
  const subOp = useSharedValue(0)
  const gridOp = useSharedValue(0)
  const gridY = useSharedValue(30)
  const btnS = useSharedValue(0)

  useEffect(() => {
    titleY.value = withDelay(150, withSpring(0, SPRING.gentle))
    titleOp.value = withDelay(150, withTiming(1, { duration: 500 }))
    subY.value = withDelay(300, withSpring(0, SPRING.gentle))
    subOp.value = withDelay(300, withTiming(1, { duration: 500 }))
    gridOp.value = withDelay(500, withTiming(1, { duration: 400 }))
    gridY.value = withDelay(500, withSpring(0, SPRING.gentle))
  }, [])

  useEffect(() => {
    if (picked) {
      btnS.value = withSpring(1, SPRING.bouncy)
    }
  }, [picked])

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOp.value,
    transform: [{ translateY: titleY.value }],
  }))
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOp.value,
    transform: [{ translateY: subY.value }],
  }))
  const gridStyle = useAnimatedStyle(() => ({
    opacity: gridOp.value,
    transform: [{ translateY: gridY.value }],
  }))
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnS.value }],
    opacity: btnS.value,
  }))

  const [greetIdx, setGreetIdx] = useState(0)
  const greetOp = useSharedValue(1)

  useEffect(() => {
    const interval = setInterval(() => {
      greetOp.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setGreetIdx)((greetIdx + 1) % LANGUAGES.length)
          greetOp.value = withTiming(1, { duration: 300 })
        }
      })
    }, 900)
    return () => clearInterval(interval)
  }, [greetIdx])

  const greetStyle = useAnimatedStyle(() => ({
    opacity: greetOp.value,
  }))

  const handleContinue = async () => {
    if (!picked) return
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setCode(picked)
    router.replace('/onboarding')
  }

  const pickedLang = LANGUAGES.find(l => l.code === picked)

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.forest }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.forest} />

      <Animated.View style={[titleStyle, { paddingTop: 72, alignItems: 'center', paddingHorizontal: 24 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: COLORS.harvest, alignItems: 'center',
            justifyContent: 'center', marginRight: 12,
            shadowColor: COLORS.harvest, shadowRadius: 16, shadowOpacity: 0.5, elevation: 8,
          }}>
            <Text style={{ fontSize: 24 }}>🌾</Text>
          </View>
          <Text style={{ fontSize: 32, fontFamily: 'Poppins_800ExtraBold', color: COLORS.white, letterSpacing: 0.5 }}>
            Mandi-Agent
          </Text>
        </View>
      </Animated.View>

      <Animated.View style={[subStyle, { alignItems: 'center', marginBottom: 4, height: 36, justifyContent: 'center' }]}>
        <Animated.Text style={[greetStyle, { fontSize: 22, color: COLORS.harvest, fontFamily: 'Poppins_500Medium', letterSpacing: 0.5 }]}>
          {LANGUAGES[greetIdx].greeting}
        </Animated.Text>
      </Animated.View>

      <Animated.View style={[subStyle, { alignItems: 'center', marginBottom: 28 }]}>
        <Text style={{ fontSize: 15, color: COLORS.sprout, fontFamily: 'Poppins_500Medium' }}>Choose your language</Text>
        <Text style={{ fontSize: 13, color: COLORS.muted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>अपनी भाषा चुनें</Text>
      </Animated.View>

      <Animated.View style={[gridStyle, { flex: 1 }]}>
        <FlatList
          data={LANGUAGES}
          numColumns={2}
          keyExtractor={item => item.code}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item, index }) => (
            <LangCard
              item={item}
              index={index}
              isSelected={picked === item.code}
              onPress={() => {
                setPicked(item.code)
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              }}
            />
          )}
        />
      </Animated.View>

      <Animated.View style={[btnStyle, { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16 }]}>
        {picked && (
          <>
            <Text style={{ textAlign: 'center', color: COLORS.sprout, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 12 }}>
              {pickedLang?.greeting} · {pickedLang?.englishName} selected
            </Text>
            <Pressable
              onPress={handleContinue}
              style={({ pressed }) => ({
                backgroundColor: pressed ? COLORS.clay : COLORS.harvest,
                borderRadius: 30, height: 58,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: COLORS.harvest, shadowRadius: 20, shadowOpacity: 0.45, elevation: 10,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 17, color: COLORS.night, letterSpacing: 0.3 }}>
                {pickedLang?.nativeName} में जारी रखें →
              </Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </View>
  )
}

function LangCard({ item, index, isSelected, onPress }: { item: typeof LANGUAGES[0]; index: number; isSelected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1)
  const glow = useSharedValue(0)
  const entY = useSharedValue(24)
  const entOp = useSharedValue(0)

  useEffect(() => {
    const delay = index * 60
    entY.value = withDelay(delay, withSpring(0, SPRING.gentle))
    entOp.value = withDelay(delay, withTiming(1, { duration: 350 }))
  }, [])

  useEffect(() => {
    if (isSelected) {
      scale.value = withSequence(withSpring(0.93, SPRING.snappy), withSpring(1.05, SPRING.bouncy), withSpring(1.00, SPRING.gentle))
      glow.value = withTiming(1, { duration: 200 })
    } else {
      scale.value = withSpring(1.0, SPRING.gentle)
      glow.value = withTiming(0, { duration: 200 })
    }
  }, [isSelected])

  const animatedBorderWidth = interpolate(glow.value, [0, 1], [1, 2.5])

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={1} style={{ flex: 1 }}>
      <Animated.View style={{
        transform: [{ scale: scale.value }, { translateY: entY.value }],
        opacity: entOp.value,
        borderWidth: animatedBorderWidth,
        borderColor: `rgba(245,158,11,${glow.value})`,
        backgroundColor: isSelected ? '#1a5c3e' : COLORS.canopy,
        borderRadius: 18, padding: 16, minHeight: 110, overflow: 'hidden',
      }}>
        {isSelected && (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: 18 }} />
        )}
        <Text style={{
          fontSize: 30, color: isSelected ? COLORS.harvest : COLORS.sprout,
          fontWeight: '700', marginBottom: 2, includeFontPadding: false,
        }}>
          {item.nativeName}
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isSelected ? COLORS.grain : COLORS.muted, marginBottom: 10 }}>
          {item.englishName}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.muted }}>{item.farmers} farmers</Text>
          {isSelected && (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.harvest, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.night, fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: 'rgba(156,163,175,0.7)', marginTop: 6 }}>{item.states}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}
