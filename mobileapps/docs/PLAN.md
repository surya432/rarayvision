# Plan: Auto-Capture Absensi dengan Watermark Geolocation (Offline-First)

> Status: **Locked & In Implementation**
> Tanggal: 2026-08-05
> Update terakhir: 2026-08-06 — migrasi `CameraComponent` ke pola **Outputs API** resmi vision-camera 5.x.

## Tujuan

Menambahkan fitur auto-capture wajah + watermark lat/long + offline-first state management pada aplikasi `faceAbsensi` (React Native 0.86.2). Capture terjadi otomatis saat validasi wajah `isValid === true` secara berturut-turut selama ≥5 frame, lalu dilanjutkan countdown 3-2-1.

## Library Baru (Terverifikasi)

| Library | Versi Terpasang | Catatan |
|---|---|---|
| `@legendapp/state` | `3.0.0-beta.48` | **v3 masih BETA** — `latest` npm masih v2.1.15. User eksplisit minta v3, sehingga kami terima beta. API baru: `@legendapp/state/persist-plugins/mmkv` |
| `react-native-mmkv` | `4.3.2` | Pakai Nitro Modules (sudah ada dependency `react-native-nitro-modules` di project). API: `createMMKV({ id })` |
| `react-native-image-marker` | `2.1.0` | API native: `Marker.markText({ backgroundImage, watermarkTexts, saveFormat })` |
| `react-native-geolocation-service` | `5.3.1` | Callback-based `getCurrentPosition`, akan di-wrap ke Promise |
| `@react-native-community/netinfo` | `12.0.1` | Untuk auto-retry saat online |

> ⚠️ **Catatan Keamanan**: `@legendapp/state` v3 beta — API `persistObservable` mungkin berubah sebelum stable. Pantau changelog sebelum upgrade.

## Perubahan API: vision-camera 5.x

vision-camera 5.2.0 sudah **tidak** pakai `camera.takePhoto()` lama. API baru:
```ts
const photoOutput = usePhotoOutput({ ... })
<Camera outputs={[photoOutput]} ... />
const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {})
// file.filePath → filesystem path
```

### Pola Outputs API (diadopsi 2026-08-06)

`CameraComponent` tidak lagi memakai wrapper `<Camera />` dari
`react-native-vision-camera-face-detector` (yang menyuntikkan `FaceDetectorOutput`
secara implisit di balik layar). Sebagai gantinya, dipakai pola resmi vision-camera
5.x: **semua output dibuat secara eksplisit di level komponen via hook**, lalu
dilewatkan sebagai `outputs={[...]}`. Ini menghindari indirection, memudahkan
debugging, dan memastikan `useFaceAutoCapture` (yang bergantung pada
`usePhotoOutput().capturePhotoToFile`) dapat berjalan berdampingan dengan face
detection dalam satu sesi kamera.

```ts
// src/features/faceAbsensi/CameraComponent.tsx
const photoOutput = usePhotoOutput({ ... })
const faceDetectorOutput = useFaceDetectorOutput({
  onFacesDetected: handleFacesDetected,
  onError: handleError,
  windowWidth: screenWidth,
  windowHeight: screenHeight,
  cameraFacing: 'front',
  performanceMode: 'fast',
  minFaceSize: 0.15,
  runLandmarks: false,
  runContours: false,
  runClassifications: false,
  trackingEnabled: true,
})

<Camera
  ref={camRef}
  device={device}
  isActive
  outputs={[faceDetectorOutput, photoOutput]}
/>
```

Konfigurasi `useFaceDetectorOutput`:
| Opsi | Nilai | Alasan |
|---|---|---|
| `performanceMode` | `'fast'` | Validator throttle 120 ms; `'fast'` cukup tanpa membebani pipeline. |
| `minFaceSize` | `0.15` | Mendekteksi wajah pada jarak absensi tanpa false-positive pada background. |
| `runLandmarks`/`runContours`/`runClassifications` | `false` | Tidak dipakai oleh validator (hanya butuh `bounds`, `rollAngle`, `yawAngle`). |
| `trackingEnabled` | `true` | Stabilkan ID wajah antar-frame sehingga validator tidak reset counter. |
| `windowWidth`/`windowHeight` | `useWindowDimensions()` | Konversi koordinat face-bounds → koordinat bingkai UI konsisten dengan `FaceFrame`. |
| `cameraFacing` | `'front'` | Konsisten dengan `useCameraDevice('front')` (kamera selfie). |

## Keputusan Teknis

| Topik | Pilihan |
|---|---|
| State management | Legend-State v3 dengan `persistObservable` + MMKV adapter |
| Frame stabil | 5 frame valid berturut-turut (~600ms @ 120ms throttle) |
| Countdown | 3 → 2 → 1 (1s per step) |
| Capture lock | useRef boolean setelah 1× capture |
| Backend | Mock service dengan toggle QA (`setForceFailure`) |
| Upload retry | Queue + auto-retry saat netinfo online |
| Geolocation gate | WAJIB acquired sebelum camera aktif (re-acquire per session) |
| Custom text | Empty untuk saat ini (future: `user.name`) |
| Watermark default | timestamp + lat + long |

## Flow

```
[HomeScreen]
  tap "Mulai Absensi"
       ↓
[FaceAbsensiScreen] mount
  → useGeolocationGate (request permission, getCurrentPosition, 10s timeout)
  → success: attendanceStore.geolocation = { lat, long, accuracy }
  → gagal: block + error UI
       ↓
[CameraComponent] aktif
  → useFaceFrameValidator (5 frame stabil)
  → useFaceAutoCapture
      → counting (3-2-1)
      → capturing (photoOutput.capturePhotoToFile)
      → applyWatermark([timestamp, lat, long])
      → attendanceStore.setLastCapture({ uri, ts, lat, long, customText: '' })
      → mockAttendanceService.submit (background)
          → gagal: enqueue + retry saat online
  → <CapturePreviewModal />
       ↓
[AttendancePreviewScreen] (via navigation)
  → tampilkan foto watermarked + metadata
  → toggle QA force failure
  → navigation.popToTop() ke Home
       ↓
[HomeScreen] subscribe lastCapture + queue count
  → thumbnail capture terakhir
  → badge pending queue
```

## Struktur File

### NEW
- `docs/PLAN.md` — Dokumen ini
- `src/features/faceAbsensi/hooks/useFaceAutoCapture.tsx`
- `src/features/faceAbsensi/hooks/useGeolocationGate.tsx`
- `src/features/faceAbsensi/components/CountdownOverlay.tsx`
- `src/features/faceAbsensi/components/CapturePreviewModal.tsx`
- `src/features/faceAbsensi/components/LocationGateOverlay.tsx`
- `src/features/attendance/store/attendanceStore.ts`
- `src/features/attendance/services/attendanceService.ts`
- `src/features/attendance/services/mockAttendanceService.ts`
- `src/features/attendance/services/watermarkService.ts`
- `src/features/attendance/services/uploadQueueService.ts`
- `src/features/attendance/hooks/useNetworkSync.ts`
- `src/features/attendance/AttendancePreviewScreen.tsx`

### MODIFIED
- `src/features/faceAbsensi/FaceAbsensiScreen.tsx` — gate lokasi
- `src/features/faceAbsensi/CameraComponent.tsx` — ref + auto-capture + watermark
- `src/features/home/HomeScreen.tsx` — subscribe lastCapture + queue badge
- `src/router/MainRouter.tsx` — tambah route AttendancePreview
- `package.json` — 5 dependencies baru
- `android/app/src/main/AndroidManifest.xml` — FINE/COARSE_LOCATION
- `ios/faceAbsensi/Info.plist` — NSLocationWhenInUseUsageDescription

## Security Checklist (Sesuai AGENTS.md)

- [x] Lokasi = PII; tidak masuk `console.log` di production (`__DEV__` guard)
- [x] MMKV file lokal di app sandbox — kompromi yang dapat diterima untuk demo; production nanti pindah ke encrypted adapter
- [x] Auth token TIDAK di MMKV → `react-native-keychain` saat real backend
- [x] Foto = file system native (path-only di MMKV), bukan blob di storage
- [x] Permission flow gagal-aman (deny = block, no silent skip)
- [x] Watermark permanen sebagai bukti audit anti-tampering
- [x] HTTPS placeholder di interface `AttendanceService` (siap untuk real API)
- [x] Input divalidasi di service layer

## Informasi Sistem Absensi Online

`faceAbsensi` adalah implementasi **Face-Verified Online Attendance** — salah satu pilar Workforce Management modern.

### Pipeline Online Attendance
```
Capture → Upload → 1:N Face Match → Anti-Spoofing → Geofence → DB → Dashboard
```

### Komponen Sistem
1. **Mobile App** (RN — project ini) — Capture wajah + validasi
2. **Backend API** (mock dulu) — Terima foto, simpan, face recognition (1:N matching)
3. **Database** — Profil karyawan + face embeddings
4. **Admin Dashboard** — Laporan absensi, approval, export
5. **Integrasi Payroll** (opsional) — Hitung gaji otomatis

### Fitur Standar
- Check-in / Check-out dengan validasi wajah
- Anti-spoofing (liveness detection) untuk mencegah foto/video
- Geofencing — absensi hanya dalam radius kantor
- Multi-shift support
- Riwayat + export CSV/PDF
- Notifikasi keterlambatan
- Integration payroll

### Pertahanan Keamanan
- HTTPS + (rencana) TLS pinning
- Token JWT disimpan di `react-native-keychain` (bukan AsyncStorage/MMKV)
- Foto wajah = PII → tidak boleh masuk log release
- Backend harus validasi 1:1 matching + liveness (tidak percaya client)

## Urutan Eksekusi

1. ✅ Verifikasi library versions
2. ✅ `npm install` 5 dependencies
3. ✅ Simpan plan ke `docs/PLAN.md`
4. ✅ Setup native permissions
5. ✅ `attendanceStore.ts` (Legend-State v3 + MMKV persist)
6. ✅ Services
7. ✅ Hooks
8. ✅ Components
9. ✅ Modify FaceAbsensiScreen, CameraComponent, HomeScreen, MainRouter
10. ✅ NEW: AttendancePreviewScreen
11. ✅ `npm run lint`
12. ✅ **CameraComponent migrasi ke pola Outputs API** (2026-08-06) — lihat bagian "Pola Outputs API".
