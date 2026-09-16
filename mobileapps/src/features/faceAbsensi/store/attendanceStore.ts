/**
 * Attendance store — global state untuk hasil absensi.
 *
 * Offline-first: data di-persist ke MMKV via `@legendapp/state/sync`
 * sehingga nilai tetap tersedia setelah app restart / device reboot.
 *
 * @see https://www.legendapp.com/open-source/state/v3/usage/persist-sync/
 */
import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { observablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface GeolocationSample {
  lat: number
  long: number
  accuracy: number
}

export interface CaptureRecord {
  uri: string
  timestamp: number
  geolocation: GeolocationSample | null
  customText: string
}

export type QueueItemStatus = 'pending' | 'synced' | 'failed'

export interface UploadQueueItem {
  id: string
  capture: CaptureRecord
  retries: number
  status: QueueItemStatus
  lastError: string | null
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export interface AttendanceState {
  geolocation: GeolocationSample | null
  customText: string
  lastCapture: CaptureRecord | null
  uploadQueue: UploadQueueItem[]
  uploadStatus: UploadStatus
}

const MMKV_INSTANCE_ID = 'attendance-store'

const mmkvPlugin = observablePersistMMKV({ id: MMKV_INSTANCE_ID })

const initialState: AttendanceState = {
  geolocation: null,
  customText: '',
  lastCapture: null,
  uploadQueue: [],
  uploadStatus: 'idle',
}

export const attendanceStore$ = observable<AttendanceState>(initialState)

// Attach MMKV persistence to the observable.
syncObservable(attendanceStore$, {
  persist: {
    name: MMKV_INSTANCE_ID,
    plugin: mmkvPlugin,
  },
})

export const setGeolocation = (geo: GeolocationSample | null): void => {
  attendanceStore$.geolocation.set(geo)
}

export const setCustomText = (text: string): void => {
  attendanceStore$.customText.set(text)
}

export const setLastCapture = (capture: CaptureRecord): void => {
  attendanceStore$.lastCapture.set(capture)
}

export const clearLastCapture = (): void => {
  attendanceStore$.lastCapture.set(null)
}

export const enqueueUpload = (item: UploadQueueItem): void => {
  attendanceStore$.uploadQueue.push(item)
}

export const updateQueueItem = (
  id: string,
  patch: Partial<UploadQueueItem>,
): void => {
  const queue = attendanceStore$.uploadQueue
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i]
    if (item.id.peek() === id) {
      const target = item as unknown as Record<
        string,
        { set: (v: unknown) => void }
      >
      Object.entries(patch).forEach(([key, value]) => {
        target[key].set(value)
      })
      return
    }
  }
}

export const removeQueueItem = (id: string): void => {
  const queue = attendanceStore$.uploadQueue
  for (let i = 0; i < queue.length; i += 1) {
    if (queue[i].id.peek() === id) {
      queue.splice(i, 1)
      return
    }
  }
}

export const setUploadStatus = (status: UploadStatus): void => {
  attendanceStore$.uploadStatus.set(status)
}
