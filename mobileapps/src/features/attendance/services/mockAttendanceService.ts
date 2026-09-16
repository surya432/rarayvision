/**
 * Mock attendance service untuk development & QA.
 *
 * Mensimulasikan network delay + toggle force-failure agar UI dapat
 * menguji alur online (sukses) dan offline (gagal → enqueue → retry).
 *
 * Saat real backend tersedia: ganti instance ini dengan implementasi
 * AttendanceService berbasis fetch/axios, signature sama.
 */
import {
  AttendanceService,
  AttendanceSubmitOptions,
  AttendanceSubmitResult,
} from './attendanceService'
import type { CaptureRecord } from '../../faceAbsensi/store/attendanceStore'

const SIMULATED_LATENCY_MS = 1200

const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export class MockAttendanceService implements AttendanceService {
  private forceFailure = false

  setForceFailure(value: boolean): void {
    this.forceFailure = value
  }

  isForceFailure(): boolean {
    return this.forceFailure
  }

  async submit(
    capture: CaptureRecord,
    _options?: AttendanceSubmitOptions,
  ): Promise<AttendanceSubmitResult> {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, SIMULATED_LATENCY_MS),
    )

    if (this.forceFailure) {
      throw new AttendanceSubmitError(
        'Simulated failure (force-failure aktif)',
        capture,
      )
    }

    if (!capture.uri || capture.uri.length === 0) {
      throw new AttendanceSubmitError('URI foto kosong', capture)
    }

    if (typeof capture.timestamp !== 'number' || capture.timestamp <= 0) {
      throw new AttendanceSubmitError('Timestamp tidak valid', capture)
    }

    if (__DEV__) {
      console.log('[MockAttendanceService] submit success', {
        uri: capture.uri,
        timestamp: capture.timestamp,
      })
    }

    return {
      id: generateId(),
      receivedAt: Date.now(),
    }
  }
}

export class AttendanceSubmitError extends Error {
  readonly capture: CaptureRecord

  constructor(message: string, capture: CaptureRecord) {
    super(message)
    this.name = 'AttendanceSubmitError'
    this.capture = capture
  }
}

export const attendanceService: AttendanceService = new MockAttendanceService()
