/**
 * Layar detail absensi — menampilkan foto watermarked dari store + metadata.
 *
 * Bisa diakses dari HomeScreen sebagai showcase bahwa foto tersedia
 * untuk component lain (state management via Legend-State).
 *
 * Juga berisi toggle QA untuk force-failure mock service.
 */
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import React from 'react'
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { use$ } from '@legendapp/state/react'
import {
  attendanceStore$,
  type CaptureRecord,
} from 'features/faceAbsensi/store/attendanceStore'
import {
  attendanceService,
  MockAttendanceService,
} from 'features/attendance/services/mockAttendanceService'
import { syncPendingUploads } from 'features/attendance/services/uploadQueueService'
import { useNetworkSync } from 'features/attendance/hooks/useNetworkSync'
import type { RootStackParamList } from 'router/MainRouter'

type Nav = NativeStackNavigationProp<RootStackParamList, 'AttendancePreview'>

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const AttendancePreviewScreen: React.FC = () => {
  const navigation = useNavigation<Nav>()
  const capture = use$(attendanceStore$.lastCapture) as CaptureRecord | null
  const queueLength = use$(attendanceStore$.uploadQueue.length)
  const uploadStatus = use$(attendanceStore$.uploadStatus)
  const [forceFailure, setForceFailureState] = React.useState<boolean>(
    () =>
      attendanceService instanceof MockAttendanceService
        ? attendanceService.isForceFailure()
        : false,
  )

  useNetworkSync()

  const handleToggleForceFailure = (value: boolean): void => {
    setForceFailureState(value)
    if (attendanceService instanceof MockAttendanceService) {
      attendanceService.setForceFailure(value)
    }
  }

  const handleSyncNow = (): void => {
    void syncPendingUploads()
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Detail Absensi</Text>

      {capture ? (
        <>
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: capture.uri }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>

          <View style={styles.metaCard}>
            <MetaRow label="Waktu" value={formatTimestamp(capture.timestamp)} />
            {capture.geolocation && (
              <>
                <MetaRow
                  label="Lat"
                  value={capture.geolocation.lat.toFixed(6)}
                />
                <MetaRow
                  label="Long"
                  value={capture.geolocation.long.toFixed(6)}
                />
                <MetaRow
                  label="Akurasi"
                  value={`${capture.geolocation.accuracy.toFixed(1)} m`}
                />
              </>
            )}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Belum ada capture tersimpan.</Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status Upload</Text>
        <MetaRow label="Status" value={uploadStatus} />
        <MetaRow label="Pending queue" value={String(queueLength)} />
        <TouchableOpacity style={styles.smallButton} onPress={handleSyncNow}>
          <Text style={styles.smallButtonText}>Sync Sekarang</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QA Tools</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Force failure (mock service)</Text>
          <Switch
            value={Boolean(forceFailure)}
            onValueChange={handleToggleForceFailure}
          />
        </View>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.backButtonText}>Kembali ke Home</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

interface MetaRowProps {
  label: string
  value: string
}

const MetaRow: React.FC<MetaRowProps> = ({ label, value }) => (
  <View style={styles.metaRow}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
)

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: '#F6F7FB',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  empty: {
    color: '#666',
    fontStyle: 'italic',
    marginVertical: 32,
    textAlign: 'center',
  },
  imageWrapper: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    height: 360,
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  metaLabel: {
    color: '#666',
    fontSize: 14,
  },
  metaValue: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
    marginRight: 12,
  },
  smallButton: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#1e90ff',
    borderRadius: 8,
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  backButton: {
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})

export default AttendancePreviewScreen
