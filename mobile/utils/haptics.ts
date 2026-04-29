import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

export const hapticLight = () => {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

export const hapticMedium = () => {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

export const hapticHeavy = () => {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
}

export const hapticSuccess = () => {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success
  )
}

export const hapticError = () => {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Error
  )
}
