import { Alert, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PhotoFile, useCameraDevice, usePhotoOutput } from 'react-native-vision-camera'
import { FrameRect, useFaceFrameValidator } from 'features/faceAbsensi/hooks/useFaceFrameValidator'
import { Camera, Face } from 'react-native-vision-camera-face-detector'
import FaceFrame from 'features/faceAbsensi/components/FaceFrame'
import NoFaceFrame from 'features/faceAbsensi/components/NoFaceFrame'
import { useNavigation, useRoute } from '@react-navigation/native'
import { resizeImage } from 'core/utility'
type PermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'unavailable'

const CaptureFoto = () => {
    const params = useRoute().params
    const [cameraPermission, setCameraPermission] =
        useState<PermissionStatus>('unavailable')
    const [isChecking, setIsChecking] = useState<boolean>(true)
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
    
    return (
        <View style={styles.container}>
            <CameraComponent onDone={(text: string) => params?.onDone?.(text)} />
        </View>
    )
}


const FRAME_WIDTH_RATIO = 0.7
const FRAME_HEIGHT_RATIO = 1.4
const VALIDATION_INTERVAL_MS = 120
const CameraComponent = ({ onDone }: { onDone?: (uri: string) => void }) => {
    const device = useCameraDevice('front')
    const photoOutput = usePhotoOutput()
    const { width: screenWidth, height: screenHeight } = useWindowDimensions()
    const camRef = useRef<any>(null)
    const navigation = useNavigation()
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
    // Ensure we capture photo only once when validation becomes valid
    const takenRef = useRef<boolean>(false)

    const takepic = async () => {
        try {
            const file: PhotoFile = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false, }, {})
            const sourceUri = file.filePath
            console.log('sourceUri', sourceUri)
            const resizedUri = await resizeImage(sourceUri, 360)
            console.log('resizedUri', resizedUri)
            // forward the resized uri back to caller
            try {
                onDone?.(resizedUri)
            } catch (_) {
                // ignore callback errors
            }
            navigation.goBack()
        } catch (error) {
            console.log('takepic error', error)
        }
    }
    useEffect(() => {
        // Trigger photo capture only once when the face validation passes
        if (result.isValid && !takenRef.current) {
            takenRef.current = true
            takepic()
        }
        // No cleanup needed
    }, [result.isValid])

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

    // Hook: useMemo for camera element (unconditionally called)
    const cameraElement = useMemo(() => (
        <Camera
            ref={camRef}
            style={StyleSheet.absoluteFill}
            device={device!}
            isActive
            
            outputs={[photoOutput]}
            onFacesDetected={handleFacesDetected}
            onError={handleError}
        />
    ), [device, photoOutput, handleFacesDetected, handleError])

    return (
        <View style={styles.container}>
            {cameraElement}
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
            </View>}
        </View>
    )
}
export default CaptureFoto

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