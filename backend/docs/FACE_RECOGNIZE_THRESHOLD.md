# Face Recognition Threshold - Configuration Strategy

**Topik:** Threshold similarity untuk endpoint `/faces/recognize`
**Referensi issue:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #2](./FACES_RECOGNIZE_ANALYSIS.md#2-hardcoded-threshold-050-config---high)
**Related:** [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md) - Migrasi DB yang affect threshold implementation
**Existing config:** `app/core/config.py`

---

## Context

Di `ml_service.py:645`, threshold similarity saat ini hardcoded:

```python
if best_score > 0.50:
```

Masalah dengan pendekatan ini:

1. **Tidak adaptif per use case** — endpoint `/recognize`, `/recognize/login`, `/recognize/attendance` punya risk profile berbeda tapi pakai threshold sama
2. **Susah tuning tanpa restart** — setiap mau eksperimen nilai threshold harus ubah kode
3. **Static satu nilai per env** — tidak bisa bedakan risk level antar endpoint

---

## Rekomendasi: 3-Layer Configuration

### Layer 1 — Default Values di `config.py`

```python
# app/core/config.py (tambahan)

# Face Recognition Thresholds (per use case)
FACE_RECOGNIZE_THRESHOLD = float(os.getenv("FACE_RECOGNIZE_THRESHOLD", "0.65"))
FACE_LOGIN_THRESHOLD = float(os.getenv("FACE_LOGIN_THRESHOLD", "0.75"))
FACE_ATTENDANCE_THRESHOLD = float(os.getenv("FACE_ATTENDANCE_THRESHOLD", "0.58"))
```

**Justifikasi nilai default:**

| Endpoint | Risk Profile | Default | Alasan |
|----------|--------------|---------|--------|
| `recognize` (umum) | Medium | 0.65 | Balance antara false positive & false negative |
| `login` (otentikasi) | High | 0.75 | False positive = unauthorized access, harus ketat |
| `attendance` (absensi) | Low-Medium | 0.58 | False negative = user harus absen ulang, lebih toleran |

### Layer 2 — Environment Override

File `.env` atau `.env.production`:

```bash
# Override default per environment
FACE_RECOGNIZE_THRESHOLD=0.68
FACE_LOGIN_THRESHOLD=0.78
FACE_ATTENDANCE_THRESHOLD=0.60
```

Pattern ini **konsisten dengan config yang sudah ada** di project (`DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, dll).

### Layer 3 — Optional: Per-User Override (Future)

Tambahkan kolom di table `users` atau table baru `user_preferences`:

```python
# Future enhancement - skip untuk sekarang kecuali ada use case nyata
class UserPreference(Base):
    __tablename__ = "user_preferences"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    custom_recognize_threshold = Column(Float, nullable=True)
```

Logic: `final_threshold = user_pref.custom_threshold or settings.FACE_RECOGNIZE_THRESHOLD`

> **Catatan:** Layer 3 biasanya over-engineering. Tambah hanya kalau ada use case nyata (misal: tenant enterprise mau set threshold sendiri).

---

## Implementasi

### Step 1 — Update `config.py`

Tambah 3 variable baru di bawah `# Model paths`:

```python
# Face Recognition Thresholds (per use case)
FACE_RECOGNIZE_THRESHOLD = float(os.getenv("FACE_RECOGNIZE_THRESHOLD", "0.65"))
FACE_LOGIN_THRESHOLD = float(os.getenv("FACE_LOGIN_THRESHOLD", "0.75"))
FACE_ATTENDANCE_THRESHOLD = float(os.getenv("FACE_ATTENDANCE_THRESHOLD", "0.58"))
```

### Step 2 — Update Endpoints (controllers)

**`recognize_endpoint` di `face_controller.py:530`:**

```python
from app.core.config import FACE_RECOGNIZE_THRESHOLD

async def recognize_endpoint(
    file: UploadFile = File(...),
    threshold: float | None = Query(None, ge=0.0, le=1.0, description="Optional threshold override"),
    current_user: db_models.User = Depends(get_current_user),
    db_session: Session = Depends(db.get_db)
):
    final_threshold = threshold if threshold is not None else FACE_RECOGNIZE_THRESHOLD
    # ... pass final_threshold ke process_recognize_logic
```

**Login endpoint & attendance endpoint** (saat dibuat/diedit): pakai `FACE_LOGIN_THRESHOLD` dan `FACE_ATTENDANCE_THRESHOLD`.

### Step 3 — Update Logic Functions

**`process_recognize_logic` di `ml_service.py:616`:**

```python
def process_recognize_logic(img, tenant_faces, threshold=0.65):
    # ... existing code ...
    if best_score > threshold:
        return {...}
```

**`process_recognize_multi` di `ml_service.py:653`** — sama, terima parameter `threshold`.

**`process_global_face_login`** — pakai `FACE_LOGIN_THRESHOLD` sebagai default.

### Step 4 — Update `.env.example` (jika ada)

```bash
# .env.example - tambahkan dokumentasi
# Threshold recognition (0.0 - 1.0). Higher = lebih ketat.
FACE_RECOGNIZE_THRESHOLD=0.65
FACE_LOGIN_THRESHOLD=0.75
FACE_ATTENDANCE_THRESHOLD=0.58
```

---

## Optional: Query Param Override

Untuk testing/admin, bisa terima threshold via query param:

```python
async def recognize_endpoint(
    file: UploadFile = File(...),
    threshold: float | None = Query(None, ge=0.0, le=1.0),
    ...
):
```

**Validasi:** `ge=0.0, le=1.0` untuk pastikan nilai masuk akal (cosine similarity range).

**Use case:** Admin mau testing dengan threshold lebih rendah untuk debugging tanpa ubah env & restart.

---

## Trade-off Comparison

| Aspek | Env-Only | 3-Layer (Usulan) |
|-------|----------|------------------|
| Simplicity | ★★★★★ | ★★★ |
| Flexibility | ★ | ★★★★★ |
| Security per endpoint | Semua sama | Bisa beda per risk |
| Maintenance overhead | Low | Medium |
| Cocok untuk multi-tenant | Tidak | Ya (kalau Layer 3 aktif) |

---

## Status

- [x] Diskusi selesai - sepakat pakai 3-layer config
- [ ] Implementasi Step 1 — Update `config.py`
- [ ] Implementasi Step 2 — Update endpoints
- [ ] Implementasi Step 3 — Update logic functions
- [ ] Implementasi Step 4 — Update `.env.example`
- [ ] Testing per endpoint dengan threshold berbeda
- [ ] Docs Swagger update (deskripsi param `threshold`)

---

## Catatan Tambahan

- **Pydantic BaseSettings?** Project ini pakai plain `os.getenv`, tidak pakai `BaseSettings`. Konsisten dengan pattern existing — jangan ubah jadi Pydantic kecuali refactor besar.
- **Range validasi:** Cosine similarity ada di range `[-1, 1]`, tapi untuk face embedding biasanya `[0, 1]`. Validasi `ge=0.0, le=1.0` cukup aman.
- **Logging:** Pertimbangkan tambah log warning kalau threshold terlalu rendah (`< 0.4`) atau terlalu tinggi (`> 0.9`) untuk detect misconfiguration.

---

## Integrasi dengan Migrasi pgvector

Saat threshold logic di-integrasikan dengan [pgvector migration](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md), ada perubahan kecil di cara threshold digunakan:

**Sebelum (loop linear):**
```python
# Threshold dipake setelah loop selesai
best_score = 0
for user in tenant_faces:
    sim = compute_similarity(target_emb, user['embedding'])
    if sim > best_score:
        best_score = sim
        best_match = user

if best_score > threshold:    # ← Threshold check setelah loop
    return match_result
```

**Sesudah (pgvector SQL):**
```python
# Threshold jadi filter di WHERE clause
query = text("""
    SELECT face_id, name, 1 - (embedding <=> CAST(:q AS vector)) AS similarity
    FROM faces
    WHERE user_id = :uid
      AND 1 - (embedding <=> CAST(:q AS vector)) >= :threshold    # ← Pre-filter
    ORDER BY embedding <=> CAST(:q AS vector)
    LIMIT 1
""")
# Threshold sebagai pre-filter = lebih efisien (skip data yang tidak memenuhi)
```

**Implikasi:**
- Threshold **lebih awal** di query → index HNSW tidak perlu return kandidat yang di bawah threshold
- Kalau threshold dinaikkan, recall bisa turun untuk edge cases (face hampir mirip tapi tidak sampai threshold) — monitor false negative rate
- Cosine distance di pgvector (`<=>`) = `1 - cosine_similarity`. Jadi `1 - (embedding <=> query) >= threshold` equivalent dengan `similarity >= threshold`
