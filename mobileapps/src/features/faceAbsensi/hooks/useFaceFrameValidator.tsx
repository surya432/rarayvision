import { useCallback, useState } from 'react'
import { Face } from 'react-native-vision-camera-face-detector'

/**
 * Status posisi wajah pengguna relatif terhadap bingkai panduan.
 *  - idle          : validasi belum berjalan
 *  - no-face       : tidak ada wajah terdeteksi
 *  - not-centered  : wajah tidak di tengah bingkai
 *  - too-far       : wajah terlalu jauh (separuh badan tidak terlihat)
 *  - too-close     : wajah terlalu dekat (tidak muat di bingkai)
 *  - not-aligned   : kepala miring / tidak menghadap lurus ke kamera
 *  - valid         : semua syarat terpenuhi (capture-ready)
 */
export type FaceValidationStatus =
    | 'idle'
    | 'no-face'
    | 'not-centered'
    | 'too-far'
    | 'too-close'
    | 'not-aligned'
    | 'valid'
    | 'multi-face'

export interface FaceValidationResult {
    status: FaceValidationStatus
    message: string
    isValid: boolean
    frameColor: string
    timestamp: number
    frame: FrameRect
}

export interface FrameRect {
    x: number
    y: number
    width: number
    height: number
}

/**
 * Threshold rasio area wajah terhadap area bingkai.
 *  - MIN : jika di bawah, wajah dianggap terlalu jauh.
 *  - MAX : jika di atas, wajah dianggap terlalu dekat (tidak muat separuh badan).
 *          Diset konservatif untuk memastikan wajah pas di dalam bingkai.
 */
const MIN_AREA_RATIO = 1.5
const MAX_AREA_RATIO = 2.5
const MIN_FACE_WIDTH = 0.8
/** Batas kemiringan kepala dalam derajat (roll = kemiringan, yaw = hadap kiri/kanan). */
const ROLL_THRESHOLD = 15
const YAW_THRESHOLD = 20
const MIN_AREA_RATIO_FACE= 0.8

const MESSAGES: Record<FaceValidationStatus, string> = {
    idle: 'Posisikan wajah Anda di dalam bingkai',
    'no-face': 'Wajah tidak terdeteksi',
    'not-centered': 'Posisikan wajah di tengah bingkai',
    'too-far': 'Dekatkan wajah sedikit',
    'too-close': 'Jauhkan wajah sedikit',
    'not-aligned': 'Hadap lurus ke kamera',
    'multi-face': "Wajah lebih dari satu",
    valid: 'Wajah terdeteksi dengan baik',
}

const COLORS: Record<FaceValidationStatus, string> = {
    idle: '#FFFFFF',
    'no-face': '#FF3B30',
    'multi-face': '#FF3B30',
    'not-centered': '#FF9500',
    'too-far': '#FF9500',
    'too-close': '#FF9500',
    'not-aligned': '#FF9500',
    valid: '#34C759',
}

/**
 * Mengembalikan area bounding box wajah.
 * Dipakai untuk memilih wajah terdekat saat lebih dari satu wajah terdeteksi.
 */
const getFaceArea = (face: Face): number => face.bounds.width * face.bounds.height

/**
 * Mengambil wajah terdekat (area bounding box terbesar) dari daftar wajah.
 * Asumsi: pada umumnya, wajah yang lebih dekat dengan kamera menghasilkan
 * bounding box yang lebih besar di preview.
 */
const pickClosestFace = (faces: Face[]): Face =>
    faces.reduce((closest, current) => (getFaceArea(current) > getFaceArea(closest) ? current : closest))

/**
 * Hook untuk memvalidasi posisi wajah relatif terhadap bingkai panduan.
 *
 * Memvalidasi tiga syarat absensi:
 *  1) posisi wajah jelas dan sejajar dengan kamera (tengah + alignment).
 *  2) wajah proporsional terhadap bingkai (separuh badan terlihat).
 *  3) tidak ada lebih dari satu wajah yang dipakai — bila ada, hanya yang
 *     terdekat yang divalidasi.
 *
 * @param frame - Rectangular region bingkai panduan pada koordinat preview.
 * @returns Object berisi status validasi saat ini dan fungsi validator.
 */
export const useFaceFrameValidator = (
    frame: FrameRect,
): {
    result: FaceValidationResult
    validate: (faces: Face[]) => FaceValidationResult
} => {
    const [result, setResult] = useState<FaceValidationResult>({
        status: 'idle',
        message: MESSAGES.idle,
        isValid: false,
        frameColor: COLORS.idle,
        timestamp: Date.now(),
        frame: frame
    })

    const validate = useCallback(
        (faces: Face[]): FaceValidationResult => {
            const build = (status: FaceValidationStatus): FaceValidationResult => ({
                status,
                message: MESSAGES[status],
                isValid: status === 'valid',
                frameColor: COLORS[status],
                timestamp: Date.now(),
                frame: frame,
            })
            if (faces.length == 0) {
                const r = build('no-face')
                setResult(r)
                return r
            }

            // Bila terdeteksi lebih dari satu wajah, pilih yang terdekat
            // sebagai subjek validasi. Hanya satu wajah yang diproses.
            const primaryFace = faces.length > 1 ? pickClosestFace(faces) : faces[0]

            if (!primaryFace) {
                const r = build('no-face')
                setResult(r)
                return r
            }

            const { rollAngle, yawAngle } = primaryFace

            // Syarat 1 (separuh badan): area wajah harus proporsional terhadap bingkai.
            const faceArea = getFaceArea(primaryFace)
            const frameArea = frame.width * frame.height
            const areaRatio = frameArea > 0 ? faceArea / frameArea : 0

            if (faces.length === 0 || areaRatio <= MIN_AREA_RATIO_FACE) {
                const r = build('no-face')
                setResult(r)
                return r
            }

            if (areaRatio < MIN_FACE_WIDTH) {
                const r = build('no-face')
                setResult(r)
                return r
            }


            if (areaRatio < MIN_AREA_RATIO) {
                const r = build('too-far')
                setResult(r)
                return r
            }

            if (areaRatio > MAX_AREA_RATIO) {
                const r = build('too-close')
                setResult(r)
                return r
            }

            // Syarat 2 (kesegarisan): hadap lurus ke kamera.
            // Field angle bersifat opsional tergantung versi library — periksa undefined.
            if (typeof rollAngle === 'number' && Math.abs(rollAngle) > ROLL_THRESHOLD) {
                const r = build('not-aligned')
                setResult(r)
                return r
            }

            if (typeof yawAngle === 'number' && Math.abs(yawAngle) > YAW_THRESHOLD) {
                const r = build('not-aligned')
                setResult(r)
                return r
            }

            const r = build('valid')
            setResult(r)
            return r
        },
        [frame],
    )

    return { result, validate }
}