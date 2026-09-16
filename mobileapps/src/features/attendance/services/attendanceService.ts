/**
 * Kontrak service absensi.
 *
 * Pemisahan interface dari implementasi (DIP) memungkinkan mock service
 * diganti dengan HTTP/Fetch client ke backend production tanpa mengubah
 * UI layer. Token auth disuntikkan lewat opsi (bukan hardcoded).
 */
import type { CaptureRecord } from '../../faceAbsensi/store/attendanceStore'

export interface AttendanceSubmitOptions {
  authToken?: string
  signal?: AbortSignal
}

export interface AttendanceSubmitResult {
  id: string
  receivedAt: number
}

export interface AttendanceService {
  submit(
    capture: CaptureRecord,
    options?: AttendanceSubmitOptions,
  ): Promise<AttendanceSubmitResult>
}
