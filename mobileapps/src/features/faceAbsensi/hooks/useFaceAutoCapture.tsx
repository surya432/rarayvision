/**
 * Hook auto-capture — memicu foto otomatis saat wajah valid stabil.
 *
 * State machine:
 *   idle → stabilizing (counter frame valid)
 *        → counting   (countdown 3-2-1, 1s per step)
 *        → capturing  (photoOutput.capturePhotoToFile)
 *        → captured   (modal preview muncul)
 *
 * Setiap session lock 1× capture untuk mencegah duplikat.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePhotoOutput, type PhotoFile } from 'react-native-vision-camera'
import { setLastCapture } from 'features/faceAbsensi/store/attendanceStore'
import type {
  CaptureRecord,
  GeolocationSample,
} from 'features/faceAbsensi/store/attendanceStore'
import { watermarkService } from 'features/attendance/services/watermarkService'
import { resizeImage } from 'core/utility'
import { BASE_URL_IMAGE } from 'core/utility/Contants'
import { faceRecognize } from '../actions/absensi'
import moment from 'moment'

export type AutoCaptureStatus =
  | 'idle'
  | 'stabilizing'
  | 'counting'
  | 'capturing'
  | 'watermarking'
  | 'captured'
  | 'error'

export interface UseFaceAutoCaptureOptions {
  isFaceValid: boolean
  validationTimestamp?: number
  geolocation: GeolocationSample | null
  requiredStableFrames?: number
  countdownStepMs?: number
  frame?: any | null
  typeFunc: any
}

export interface UseFaceAutoCaptureResult {
  status: AutoCaptureStatus
  countdownValue: number
  errorMessage: string | null
  reset: () => void
  photoOutput: any
}

const DEFAULT_STABLE_FRAMES = 3
const DEFAULT_COUNTDOWN_STEP_MS = 1000
const COUNTDOWN_START = 5

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const useFaceAutoCapture = (
  options: UseFaceAutoCaptureOptions,
): UseFaceAutoCaptureResult => {
  const {
    isFaceValid,
    validationTimestamp,
    geolocation = null,
    requiredStableFrames = DEFAULT_STABLE_FRAMES,
    countdownStepMs = DEFAULT_COUNTDOWN_STEP_MS,
    typeFunc = "caputure"
  } = options

  const photoOutput = usePhotoOutput()
  const [status, setStatus] = useState<AutoCaptureStatus>('idle')
  const [countdownValue, setCountdownValue] = useState<number>(COUNTDOWN_START)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stableCounterRef = useRef<number>(0)
  const lockedRef = useRef<boolean>(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const clearAllTimers = useCallback((): void => {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
  }, [])

  const takeFoto = useCallback(async (): Promise<void> => {
    if (lockedRef.current) return
    lockedRef.current = true
    try {
      console.log('state')
      setStatus('capturing')
      const file: PhotoFile = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false, }, {})
      const sourceUri = file.filePath

      const resizedUri = await resizeImage(sourceUri, 360);
      console.log("resizedUri", resizedUri)
    } catch (error) {
      console.log('eeror', error)
    }
  }, [photoOutput]);

  const runCapture = useCallback(async (): Promise<void> => {
    if (lockedRef.current) return
    lockedRef.current = true

    if (!geolocation) {
      setErrorMessage('Lokasi belum tersedia — capture dibatalkan.')
      setStatus('error')
      return
    }
    let isMatch = false

    try {
      setStatus('capturing')
      const file: PhotoFile = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false, }, {})
      const sourceUri = file.filePath

      setStatus('watermarking')
      const filename = `absensi-${Date.now()}`
      const lines = [
        { text: formatTimestamp(Date.now()) },
        { text: `Lat: ${geolocation.lat.toFixed(6)}` },
        { text: `Long: ${geolocation.long.toFixed(6)}` },
      ]

      const watermarkedUri = await watermarkService.applyTextWatermark({
        sourceUri,
        lines,
        filename,
      })

      const timeStart = moment().unix()
      // resize images for uploading 500kb
      const resizedUri = await resizeImage(watermarkedUri, 360);

      const response = await faceRecognize({
        uri: resizedUri,
        filename: filename,
        timestamp: Date.now(),
        geolocation: {
          lat: geolocation.lat,
          long: geolocation.long
        },
      })
      const timeEnd = moment().unix()
      isMatch = response.match === true
      const record: CaptureRecord = {
        uri: `${BASE_URL_IMAGE}${response.image_url}`,
        timestamp: timeEnd - timeStart,
        geolocation,
        customText: `${response.name} - ${Number(response.similarity).toFixed(4)}`,
      }
      setLastCapture(record)

      setStatus('captured')
      setTimeout(() => {
        reset()
      }, 10000)

    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Gagal mengambil foto'
      setErrorMessage(message)
      setStatus('error')
      lockedRef.current = false
      setTimeout(() => {
        reset()
      }, 2000)
    }
  }, [geolocation, photoOutput])

  useEffect(() => {
    if (lockedRef.current) return

    if (!isFaceValid) {
      stableCounterRef.current = 0
      if (status === 'stabilizing' || status === 'counting') {
        clearAllTimers()
        setCountdownValue(COUNTDOWN_START)
        setStatus('idle')
      }
      return
    }

    if (status === 'idle') {
      stableCounterRef.current = 0
      setStatus('stabilizing')
      return
    }

    if (status === 'stabilizing') {
      stableCounterRef.current += 1
      if (stableCounterRef.current >= requiredStableFrames) {
        // setStatus('counting')
        // setCountdownValue(COUNTDOWN_START)

        // for (let i = 1; i <= COUNTDOWN_START; i += 1) {
        //   const timer = setTimeout(() => {
        //     setCountdownValue(COUNTDOWN_START - i)
        //     if (i === COUNTDOWN_START) {
        console.log('typeFunc', typeFunc)
        if (typeFunc === 'caputure') {
          void runCapture()
        } else {
          void takeFoto()

        }
        //     }
        //   }, i * countdownStepMs)
        //   timersRef.current.push(timer)
        // }
      }
    }
  }, [
    isFaceValid,
    validationTimestamp,
    status,
    requiredStableFrames,
    countdownStepMs,
    clearAllTimers,
    runCapture,
  ])

  useEffect(() => {
    return () => {
      clearAllTimers()
    }
  }, [clearAllTimers])

  const reset = useCallback((): void => {
    clearAllTimers()
    stableCounterRef.current = 0
    lockedRef.current = false
    setCountdownValue(COUNTDOWN_START)
    setErrorMessage(null)
    setStatus('idle')
  }, [clearAllTimers])
  return { status, countdownValue, errorMessage, reset, photoOutput }
}
