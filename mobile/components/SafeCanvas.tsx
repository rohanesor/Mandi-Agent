import { Platform, View } from 'react-native'
import React from 'react'

// Dynamic import to avoid web crash
let SkiaCanvas: any = null
if (Platform.OS !== 'web') {
  SkiaCanvas =
    require('@shopify/react-native-skia').Canvas
}

interface SafeCanvasProps {
  style?: any
  children?: React.ReactNode
  width?: number
  height?: number
}

export function SafeCanvas({
  style,
  children,
  ...props
}: SafeCanvasProps) {
  // Web: render a plain View (no 3D/Skia)
  if (Platform.OS === 'web' || !SkiaCanvas) {
    return (
      <View style={style}>
        {/* Web fallback: skip Skia canvas children */}
      </View>
    )
  }
  // Native: render real Skia Canvas
  return (
    <SkiaCanvas style={style} {...props}>
      {children}
    </SkiaCanvas>
  )
}
