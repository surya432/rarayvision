/**
 * Komposisi utama layar deteksi wajah + auto-capture.
 *
 * Menghubungkan:
 * - Vision Camera (preview + deteksi wajah via ML Kit).
 * - useFaceFrameValidator (logika validasi posisi).
 * - useFaceAutoCapture (countdown + capture + watermark).
 * - FaceFrame (UI bingkai panduan).
 * - CountdownOverlay & CapturePreviewModal (UI flow auto-capture).
 *
 * DEPENDENCY: react-native-vision-camera 5.x dengan usePhotoOutput API.
 */
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import React, { useCallback, useMemo, useRef } from 'react'
import { Camera, Face } from 'react-native-vision-camera-face-detector'
import { useCameraDevice } from 'react-native-vision-camera'
import { FrameRect, useFaceFrameValidator } from './hooks/useFaceFrameValidator'
import { useFaceAutoCapture } from './hooks/useFaceAutoCapture'
import FaceFrame from './components/FaceFrame'
import CapturePreviewModal from './components/CapturePreviewModal'
import type { GeolocationSample, CaptureRecord } from 'features/faceAbsensi/store/attendanceStore'
import { attendanceStore$ } from 'features/faceAbsensi/store/attendanceStore'
import { use$ } from '@legendapp/state/react'
import NoFaceFrame from './components/NoFaceFrame'

interface CameraComponentProps {
  geolocation: GeolocationSample
  onDone: () => void
}

const FRAME_WIDTH_RATIO = 0.7
const FRAME_HEIGHT_RATIO = 1.4
const VALIDATION_INTERVAL_MS = 120

const CameraComponent: React.FC<CameraComponentProps> = ({
  geolocation,
  onDone,
}) => {
  const device = useCameraDevice('front')
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const camRef = useRef<any>(null)
  const personDetectedRef = useRef<boolean>(false)
  const frame = useMemo<FrameRect>(() => {
    const width = screenWidth * FRAME_WIDTH_RATIO
    const height = width * FRAME_HEIGHT_RATIO
    return {
      width,
      height,
      x: (screenWidth - width) / 2,
      y: (screenHeight - height) / 2,
    }
  }, [screenWidth, screenHeight])

  const { result, validate } = useFaceFrameValidator(frame)
  const lastValidationRef = useRef<number>(0)

  const handleFacesDetected = useCallback(
    (faces: Face[]): void => {
      const now = Date.now()
      if (now - lastValidationRef.current < VALIDATION_INTERVAL_MS) {
        return
      }
      lastValidationRef.current = now

      validate(faces)
    },
    [validate],
  )
  const handleError = useCallback((error: Error): void => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('Camera error:', error)
    }
  }, [])

  const auto = useFaceAutoCapture({
    isFaceValid: result.isValid,
    validationTimestamp: result.timestamp,
    frame: result.frame,
    geolocation,
    typeFunc: "caputure"
  })

  // Hook: useMemo for camera element (unconditionally called)
  const cameraElement = useMemo(() => (
    <Camera
      ref={camRef}
      style={StyleSheet.absoluteFill}
      device={device!}
      isActive
      outputs={[auto.photoOutput]}
      onFacesDetected={handleFacesDetected}
      onError={handleError}
    />
  ), [device, auto?.photoOutput, handleFacesDetected, handleError])

  // Hook: use$ to get last capture (unconditionally called)
  const lastCapture = use$(attendanceStore$.lastCapture) as CaptureRecord | null


  return (
    <View style={styles.container}>
      {auto.status !== 'captured' && cameraElement}
      {result.status === "no-face" && <NoFaceFrame />}
      {result.status !== 'no-face' && <View style={{ flex: 1 }}>

        <FaceFrame
          width={frame.width}
          height={frame.height}
          x={frame.x}
          y={frame.y}
          color={result.frameColor}
          message={result.message}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />

        {/* {(auto.status === 'counting' ||
          auto.status === 'capturing' ||
          auto.status === 'watermarking') && (
            <CountdownOverlay value={auto.countdownValue} />
          )} */}

        {auto.status === 'captured' && lastCapture && (
          <CapturePreviewModal
            visible
            capture={lastCapture}
            onDone={() => { auto.reset() }}
          />
        )}

        {auto.status === 'error' && (
          <View style={styles.errorBanner} pointerEvents="none">
            <Text style={styles.errorText}>{auto.errorMessage}</Text>
          </View>
        )}
      </View>}
    </View>
  )
}

export default CameraComponent

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  noDeviceContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDeviceText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: 8,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    maxHeight: 150
  },
  notDetectFaces: {
    flex: 1,
    justifyContent: "center",
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,1)'
  },
  textNoFaces: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    width: '80%'
  }
})
