/**
 * Layar absensi utama.
 *
 * Flow (mirroring izin kamera):
 *   1. Check + request izin kamera (PermissionStatus)
 *   2. Check + request izin lokasi (LocationPermissionStatus)
 *   3. Auto-acquire GPS setelah izin granted
 *   4. Jika GPS acquired → aktifkan CameraComponent dengan auto-capture
 *   5. Setelah capture → tampilkan preview modal → kembali ke Home
 */
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import CameraComponent from './CameraComponent'
import LocationGateOverlay from './components/LocationGateOverlay'
import type { RootStackParamList } from 'router/MainRouter'
import { useGeolocationGate } from 'core/hooks/useGeolocationGate'

type PermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'unavailable'

type Nav = NativeStackNavigationProp<RootStackParamList, 'FaceAbsensi'>

const FaceAbsensiScreen: React.FC = () => {
  const navigation = useNavigation<Nav>()
  const [cameraPermission, setCameraPermission] =
    useState<PermissionStatus>('unavailable')
  const [isChecking, setIsChecking] = useState<boolean>(true)
  const gate = useGeolocationGate()

  const checkCameraPermission =
    useCallback(async (): Promise<PermissionStatus> => {
      if (Platform.OS !== 'android') {
        return 'unavailable'
      }
      try {
        const status = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        )
        return status ? 'granted' : 'denied'
      } catch {
        return 'unavailable'
      }
    }, [])

  const requestCameraPermission =
    useCallback(async (): Promise<PermissionStatus> => {
      if (Platform.OS !== 'android') {
        return 'unavailable'
      }
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Izin Kamera',
            message:
              'Absensi membutuhkan akses kamera untuk verifikasi wajah.',
            buttonPositive: 'Izinkan',
            buttonNegative: 'Tolak',
          },
        )
        switch (result) {
          case PermissionsAndroid.RESULTS.GRANTED:
            return 'granted'
          case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
            return 'never_ask_again'
          default:
            return 'denied'
        }
      } catch {
        return 'unavailable'
      }
    }, [])

  useEffect(() => {
    const init = async (): Promise<void> => {
      setIsChecking(true)
      const status = await checkCameraPermission()
      setCameraPermission(status)
      setIsChecking(false)
    }
    void init()
  }, [checkCameraPermission])

  const handleRequestCamera = useCallback(async (): Promise<void> => {
    const status = await requestCameraPermission()
    setCameraPermission(status)
  }, [requestCameraPermission])

  const openSettings = useCallback((): void => {
    Alert.alert(
      'Buka Pengaturan',
      'Aktifkan izin kamera & lokasi secara manual di pengaturan aplikasi.',
    )
  }, [])

  if (isChecking) {
    return (
      <View style={styles.centered}>
        <Text>Memeriksa izin kamera...</Text>
      </View>
    )
  }

  if (cameraPermission === 'denied') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Izin kamera diperlukan untuk absensi wajah.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handleRequestCamera}
        >
          <Text style={styles.buttonText}>Minta Izin Kamera</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (cameraPermission === 'never_ask_again') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Izin kamera diblokir. Aktifkan secara manual di Pengaturan.
        </Text>
        <TouchableOpacity style={styles.button} onPress={openSettings}>
          <Text style={styles.buttonText}>Buka Pengaturan</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (cameraPermission !== 'granted') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Kamera tidak tersedia</Text>
      </View>
    )
  }

  if (
    gate.permissionStatus !== 'granted' ||
    gate.acquireStatus !== 'acquired' ||
    !gate.sample
  ) {
    return (
      <LocationGateOverlay
        permissionStatus={gate.permissionStatus}
        isCheckingPermission={gate.isCheckingPermission}
        isRequestingPermission={gate.isRequestingPermission}
        acquireStatus={gate.acquireStatus}
        errorMessage={gate.errorMessage}
        onRequestPermission={() => {
          void gate.requestPermission()
        }}
        onRetryAcquire={gate.retryAcquire}
        onOpenSettings={openSettings}
      />
    )
  }

  return (
    <View style={styles.container}>
      <CameraComponent
        geolocation={gate.sample}
        onDone={() => { }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  error: {
    color: 'red',
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1e90ff',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
})

export default FaceAbsensiScreen
