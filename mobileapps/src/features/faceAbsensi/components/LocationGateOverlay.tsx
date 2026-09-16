/**
 * Overlay gate lokasi — render UI sesuai status izin + acquire.
 *
 * Flow mirroring kamera permission:
 *   - isChecking         → spinner "Memeriksa izin lokasi..."
 *   - isRequesting        → spinner "Meminta izin lokasi..."
 *   - permission denied   → "Minta Izin Lokasi" button
 *   - permission never_ask_again → "Buka Pengaturan"
 *   - granted + acquiring → spinner "Mendapatkan lokasi..."
 *   - granted + failed    → error + tombol Coba Ulang
 *   - granted + acquired  → return null (CameraComponent yang render)
 */
import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type {
  AcquireStatus,
  LocationPermissionStatus,
} from '../../../core/hooks/useGeolocationGate'

interface LocationGateOverlayProps {
  permissionStatus: LocationPermissionStatus
  isCheckingPermission: boolean
  isRequestingPermission: boolean
  acquireStatus: AcquireStatus
  errorMessage: string | null
  onRequestPermission: () => void
  onRetryAcquire: () => void
  onOpenSettings?: () => void
}

export const LocationGateOverlay: React.FC<LocationGateOverlayProps> = ({
  permissionStatus,
  isCheckingPermission,
  isRequestingPermission,
  acquireStatus,
  errorMessage,
  onRequestPermission,
  onRetryAcquire,
  onOpenSettings,
}) => {
  if (isCheckingPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e90ff" />
        <Text style={styles.title}>Memeriksa izin lokasi...</Text>
      </View>
    )
  }

  if (isRequestingPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e90ff" />
        <Text style={styles.title}>Meminta izin lokasi...</Text>
        <Text style={styles.subtitle}>
          Mohon tunggu dialog izin dari sistem.
        </Text>
      </View>
    )
  }

  if (permissionStatus === 'denied') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Izin Lokasi Diperlukan</Text>
        <Text style={styles.subtitle}>
          Absensi butuh akses lokasi untuk memverifikasi kehadiran Anda.
        </Text>
        <TouchableOpacity style={styles.button} onPress={onRequestPermission}>
          <Text style={styles.buttonText}>Minta Izin Lokasi</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (permissionStatus === 'never_ask_again') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Izin Lokasi Diblokir</Text>
        <Text style={styles.subtitle}>
          Izin lokasi diblokir permanen. Aktifkan secara manual di pengaturan
          aplikasi.
        </Text>
        {onOpenSettings && (
          <TouchableOpacity style={styles.button} onPress={onOpenSettings}>
            <Text style={styles.buttonText}>Buka Pengaturan</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  if (permissionStatus === 'unavailable') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Lokasi Tidak Tersedia</Text>
        <Text style={styles.subtitle}>
          Layanan lokasi tidak tersedia di perangkat ini.
        </Text>
      </View>
    )
  }

  if (permissionStatus === 'granted') {
    if (acquireStatus === 'acquiring') {
      return (
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#1e90ff" />
          <Text style={styles.title}>Mendapatkan lokasi Anda...</Text>
          <Text style={styles.subtitle}>
            Mohon tunggu GPS mengunci posisi.
          </Text>
        </View>
      )
    }

    if (acquireStatus === 'failed') {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Gagal Mendapatkan Lokasi</Text>
          <Text style={styles.subtitle}>{errorMessage ?? ''}</Text>
          <TouchableOpacity style={styles.button} onPress={onRetryAcquire}>
            <Text style={styles.buttonText}>Coba Ulang</Text>
          </TouchableOpacity>
        </View>
      )
    }
  }

  return null
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1e90ff',
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
})

export default LocationGateOverlay
