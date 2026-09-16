/**
 * Home screen — entry point aplikasi.
 *
 * Menampilkan ringkasan terakhir (thumbnail + pending queue count) dan
 * tombol navigasi ke layar absensi & detail absensi.
 */
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import React from 'react'
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import type { RootStackParamList } from 'router/MainRouter'
import Config from 'react-native-config'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<Nav>()

  return (
    <View style={styles.container}>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate('FaceList')}
      >
        <Text style={styles.primaryButtonText}>Daftar Wajah</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate('FaceAbsensi')}
      >
        <Text style={styles.primaryButtonText}>Mulai Absensi</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('AttendancePreview')}
      >
        <Text style={styles.secondaryButtonText}>Lihat Detail Absensi</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    backgroundColor: '#F6F7FB',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    flexDirection: 'row',
  },
  thumbnail: {
    width: 96,
    height: 96,
    backgroundColor: '#000',
  },
  cardBody: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  badge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FF9500',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  primaryButton: {
    backgroundColor: '#1e90ff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e90ff',
  },
  secondaryButtonText: {
    color: '#1e90ff',
    fontSize: 16,
    fontWeight: '600',
  },
})

export default HomeScreen
