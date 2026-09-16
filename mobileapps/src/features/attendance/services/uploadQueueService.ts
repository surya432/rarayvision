/**
 * Upload queue service — retry upload capture yang gagal.
 *
 * Alur:
 * 1. submit() dipanggil oleh caller (auto-capture flow)
 * 2. Jika AttendanceService.submit() throw → enqueue item ke store
 * 3. syncPending() dipanggil oleh useNetworkSync saat netinfo online
 * 4. Items dengan status 'pending' di-retry; 'failed' dibatasi retries
 *
 * Batas retry default: 5. Setelah itu status 'failed' permanen
 * (operator perlu intervensi manual).
 */
import {
  attendanceStore$,
  enqueueUpload,
  removeQueueItem,
  setUploadStatus,
  updateQueueItem,
  type CaptureRecord,
  type UploadQueueItem,
} from '../../faceAbsensi/store/attendanceStore'
import { attendanceService } from './mockAttendanceService'

const MAX_RETRIES = 5

const generateQueueId = (): string =>
  `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export interface SubmitResult {
  success: boolean
  id: string | null
  error: string | null
}

export const submitCapture = async (
  capture: CaptureRecord,
): Promise<SubmitResult> => {
  setUploadStatus('uploading')
  try {
    const result = await attendanceService.submit(capture)
    setUploadStatus('success')
    return { success: true, id: result.id, error: null }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upload error'
    const item: UploadQueueItem = {
      id: generateQueueId(),
      capture,
      retries: 0,
      status: 'pending',
      lastError: message,
    }
    enqueueUpload(item)
    setUploadStatus('error')
    return { success: false, id: null, error: message }
  }
}

export interface SyncResult {
  attempted: number
  synced: number
  failed: number
}

export const syncPendingUploads = async (): Promise<SyncResult> => {
  const queue = attendanceStore$.uploadQueue
  const pending = queue
    .peek()
    .filter((item) => item.status === 'pending' && item.retries < MAX_RETRIES)

  let synced = 0
  let failed = 0

  for (const item of pending) {
    try {
      await attendanceService.submit(item.capture)
      removeQueueItem(item.id)
      synced += 1
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown upload error'
      const nextRetries = item.retries + 1
      updateQueueItem(item.id, {
        retries: nextRetries,
        lastError: message,
        status: nextRetries >= MAX_RETRIES ? 'failed' : 'pending',
      })
      failed += 1
    }
  }

  return { attempted: pending.length, synced, failed }
}

export const pendingCount = (): number =>
  attendanceStore$.uploadQueue
    .peek()
    .filter((item) => item.status === 'pending').length
