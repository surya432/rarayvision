/**
 * Countdown overlay — angka besar 3 → 2 → 1 yang muncul di tengah
 * preview kamera sebelum shutter otomatis aktif.
 */
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface CountdownOverlayProps {
  value: number
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ value }) => {
  if (value <= 0) return null

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.circle}>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  circle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: 60,
    fontWeight: '700',
    color: '#FFFFFF',
  },
})

export default CountdownOverlay
