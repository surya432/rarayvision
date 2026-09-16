/**
 * Hook network sync — trigger retry upload saat device online.
 *
 * Subscribe ke NetInfo; saat isConnected berubah dari false→true,
 * panggil uploadQueueService.syncPendingUploads() untuk mengirim
 * item queue yang masih 'pending'.
 */
import { useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { syncPendingUploads } from 'features/attendance/services/uploadQueueService'

export const useNetworkSync = (): void => {
  useEffect(() => {
    let cancelled = false

    const trySync = async (): Promise<void> => {
      if (cancelled) return
      try {
        await syncPendingUploads()
      } catch (error) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[useNetworkSync] sync error:', error)
        }
      }
    }

    trySync()

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void trySync()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
}
