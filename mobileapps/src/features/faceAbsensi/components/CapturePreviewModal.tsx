/**
 * Capture preview modal — tampilkan foto hasil jepret + tombol Selesai.
 * Dipanggil dari CameraComponent saat status auto-capture = 'captured'.
 */
import React from 'react'
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { CaptureRecord } from 'features/faceAbsensi/store/attendanceStore'

interface CapturePreviewModalProps {
  visible: boolean
  capture: CaptureRecord | null
  onDone: () => void
}

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const CapturePreviewModal: React.FC<CapturePreviewModalProps> = ({
  visible,
  capture,
  onDone,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onDone}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Hasil Absensi</Text>

        {capture ? (
          <>
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: capture.uri }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Waktu</Text>
              <Text style={styles.metaValue}>
                {capture.timestamp} detik
              </Text>
            </View>
            {capture.geolocation && (
              <>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Lat</Text>
                  <Text style={styles.metaValue}>
                    {capture.geolocation.lat.toFixed(6)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Long</Text>
                  <Text style={styles.metaValue}>
                    {capture.geolocation.long.toFixed(6)}
                  </Text>
                </View>
              </>
            )}
            {capture.customText && (
              <>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Nama </Text>
                  <Text style={styles.metaValue}>
                    {capture.customText}
                  </Text>
                </View>
              </>
            )}
          </>
        ) : (
          <Text style={styles.subtitle}>Tidak ada capture.</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Selesai</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  subtitle: {
    color: '#CCCCCC',
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
  },
  imageWrapper: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2D',
  },
  metaLabel: {
    color: '#9E9E9E',
    fontSize: 14,
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    marginTop: 16,
    marginBottom: 24,
    paddingVertical: 14,
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})

export default CapturePreviewModal
