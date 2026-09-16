/**
 * Hook geolocation gate — request izin + acquire posisi GPS.
 *
 * Mengikuti pola yang sama dengan request izin kamera di
 * FaceAbsensiScreen: split `check` + `request` agar UI bisa
 * merender state eksplisit (denied / never_ask_again / granted).
 *
 * Setelah izin granted, hook otomatis memanggil getCurrentPosition.
 * Jika gagal, expose `retryAcquire` agar UI bisa re-trigger.
 *
 * Penting: dipanggil setiap kali FaceAbsensiScreen mount (re-acquire
 * per session) sesuai keputusan plan.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
import Geolocation, {
  type GeoPosition,
  type GeoError,
  PositionError,
} from 'react-native-geolocation-service'
import { setGeolocation } from 'features/faceAbsensi/store/attendanceStore'
import type { GeolocationSample } from 'features/faceAbsensi/store/attendanceStore'
import { locationStore$ } from 'core/store/locationStore'

export type LocationPermissionStatus =
  | 'unavailable'
  | 'denied'
  | 'never_ask_again'
  | 'granted'

export type AcquireStatus =
  | 'idle'
  | 'acquiring'
  | 'acquired'
  | 'failed'

export interface UseGeolocationGateResult {
  permissionStatus: LocationPermissionStatus
  isCheckingPermission: boolean
  isRequestingPermission: boolean
  acquireStatus: AcquireStatus
  sample: GeolocationSample | null
  errorMessage: string | null
  requestPermission: () => Promise<LocationPermissionStatus>
  retryAcquire: () => void
}

const ACQUIRE_TIMEOUT_MS = 10000

const checkAndroidPermission = async (): Promise<LocationPermissionStatus> => {
  try {
    const status = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    )
    return status ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}

const checkIosPermission = async (): Promise<LocationPermissionStatus> => {
  try {
    const result = await Geolocation.requestAuthorization('whenInUse')
    if (result === 'granted') return 'granted'
    if (result === 'denied' || result === 'disabled') return 'denied'
    if (result === 'restricted') return 'never_ask_again'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const checkPermission = async (): Promise<LocationPermissionStatus> => {
  if (Platform.OS === 'android') return checkAndroidPermission()
  if (Platform.OS === 'ios') return checkIosPermission()
  return 'unavailable'
}

const requestAndroidPermission =
  async (): Promise<LocationPermissionStatus> => {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Izin Lokasi',
          message:
            'Absensi membutuhkan akses lokasi untuk memverifikasi kehadiran.',
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
  }

const requestIosPermission =
  async (): Promise<LocationPermissionStatus> => {
    try {
      const result = await Geolocation.requestAuthorization('whenInUse')
      if (result === 'granted') return 'granted'
      if (result === 'denied' || result === 'disabled') return 'denied'
      if (result === 'restricted') return 'never_ask_again'
      return 'denied'
    } catch {
      return 'denied'
    }
  }

const requestPermission =
  async (): Promise<LocationPermissionStatus> => {
    if (Platform.OS === 'android') return requestAndroidPermission()
    if (Platform.OS === 'ios') return requestIosPermission()
    return 'unavailable'
  }

const getCurrentPositionAsync = (
  timeoutMs: number,
): Promise<GeoPosition> =>
  new Promise<GeoPosition>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject({
          code: PositionError.TIMEOUT,
          message: 'Timeout menunggu GPS',
        } as GeoError)
      }
    }, timeoutMs)

    Geolocation.getCurrentPosition(
      (position) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          locationStore$.set(position)
          resolve(position)
        }
      },
      (error) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(error)
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        accuracy: {
          android: 'high',
          ios: 'best',
        },
        forceRequestLocation: true,
        forceLocationManager: false,
        showLocationDialog: true,
      },
    )
  })

export const useGeolocationGate = (): UseGeolocationGateResult => {
  const [permissionStatus, setPermissionStatus] =
    useState<LocationPermissionStatus>('unavailable')
  const [isCheckingPermission, setIsCheckingPermission] =
    useState<boolean>(true)
  const [isRequestingPermission, setIsRequestingPermission] =
    useState<boolean>(false)
  const [acquireStatus, setAcquireStatus] = useState<AcquireStatus>('idle')
  const [sample, setSample] = useState<GeolocationSample | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mountedRef = useRef<boolean>(true)
  const triggerAcquireRef = useRef<number>(0)

  const acquire = useCallback(async (): Promise<void> => {
    const triggerId = triggerAcquireRef.current
    setAcquireStatus('acquiring')
    setErrorMessage(null)
    try {
      const position = await getCurrentPositionAsync(ACQUIRE_TIMEOUT_MS)
      if (!mountedRef.current || triggerId !== triggerAcquireRef.current) return
      const next: GeolocationSample = {
        lat: position.coords.latitude,
        long: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
      setSample(next)
      setGeolocation(next)
      setAcquireStatus('acquired')
    } catch (error) {
      if (!mountedRef.current || triggerId !== triggerAcquireRef.current) return
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as GeoError).code
          : null
      const message =
        code === PositionError.PERMISSION_DENIED
          ? 'Izin lokasi ditolak.'
          : code === PositionError.TIMEOUT
            ? 'GPS timeout — pastikan Anda di area terbuka.'
            : code === PositionError.POSITION_UNAVAILABLE
              ? 'Lokasi tidak tersedia saat ini.'
              : 'Gagal mendapatkan lokasi.'
      setErrorMessage(message)
      setAcquireStatus('failed')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const init = async (): Promise<void> => {
      const status = await checkPermission()
      if (!mountedRef.current) return
      setPermissionStatus(status)
      setIsCheckingPermission(false)
      if (status === 'granted') {
        triggerAcquireRef.current += 1
        void acquire()
      }
    }
    void init()
    return () => {
      mountedRef.current = false
    }
  }, [acquire])

  const requestPermissionAction =
    useCallback(async (): Promise<LocationPermissionStatus> => {
      setIsRequestingPermission(true)
      try {
        const status = await requestPermission()
        if (!mountedRef.current) return status
        setPermissionStatus(status)
        if (status === 'granted') {
          triggerAcquireRef.current += 1
          void acquire()
        }
        return status
      } finally {
        if (mountedRef.current) {
          setIsRequestingPermission(false)
        }
      }
    }, [acquire])

  const retryAcquire = useCallback((): void => {
    triggerAcquireRef.current += 1
    void acquire()
  }, [acquire])

  return {
    permissionStatus,
    isCheckingPermission,
    isRequestingPermission,
    acquireStatus,
    sample,
    errorMessage,
    requestPermission: requestPermissionAction,
    retryAcquire,
  }
}
