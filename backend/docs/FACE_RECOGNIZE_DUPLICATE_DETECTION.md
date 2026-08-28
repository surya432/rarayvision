# Face Duplicate Detection - Design (Poin #6)

**Topik:** Detect duplicate face saat register (same person, different face_id)
**Referensi issue:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #6](./FACES_RECOGNIZE_ANALYSIS.md#6-no-duplicate-detection-data-quality---medium)
**Related:** [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md) - pakai pgvector untuk detection

---

## Context

User bisa register wajah orang yang sama berkali-kali dengan `face_id` berbeda. Konsekuensi:
- DB membengkak dengan duplicate embeddings
- Recognition jadi ambigu (multiple high-similarity matches)
- Sulit debugging — "kenapa similarity score untuk Budi rendah?" (karena ada 3 entry mirip Budi)

## Keputusan Final

| Aspek | Keputusan |
|-------|-----------|
| Detection method | **pgvector top-1 similarity query** |
| Threshold | **0.85** (env-configurable) |
| Behavior saat duplicate | **Warn + Allow** (frontend decide) |
| Multi-sample storage | **Defer** (1 face_id = 1 embedding) |

---

## Tipe Duplicate

| Tipe | Definisi | Handling |
|------|----------|----------|
| **Exact match** | Same face_id, similar embedding | UPDATE existing (existing behavior) |
| **Person match** | Different face_id, same person | **DETECT & WARN** ← Poin #6 |
| **Twin/family** | Different person, very similar | **No action** (too risky to block) |

---

## Behavior Flow

```
┌─────────────────────────────────────────────────────┐
│   POST /faces/register (atau /faces/extract-face)   │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │  Detect face         │
               │  Extract embedding   │
               │  [Poin #5 quality]   │
               └──────────┬───────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │  Check duplicate     │  ← NEW
               │  via pgvector        │
               │  top-1 similarity    │
               └──────────┬───────────┘
                          │
                ┌─────────┴──────────┐
                │                    │
         sim < 0.85          sim >= 0.85
                │                    │
                ▼                    ▼
         ┌────────────┐    ┌──────────────────────┐
         │  Normal    │    │  Warn, allow         │
         │  register  │    │  register            │
         └────────────┘    └──────────────────────┘
                                   │
                                   ▼
                          ┌──────────────────────┐
                          │  Response includes:  │
                          │  - duplicate_warning │
                          │  - existing_face_info│
                          └──────────────────────┘
```

---

## Threshold Rationale

Cosine similarity untuk face embeddings:

| Threshold | Interpretation |
|-----------|----------------|
| 0.50 | Permisif (recognition umum) |
| 0.65 | Default recognition (Poin #2) |
| **0.85** | **Same person, different photos** ← Duplicate detection |
| 0.95+ | Almost certainly same photo |

**Sweet spot: 0.85** — di atas threshold = kemungkinan besar orang sama, different photos.

---

## Config (app/core/config.py)

```python
DUPLICATE_DETECTION_THRESHOLD = float(os.getenv("DUPLICATE_DETECTION_THRESHOLD", "0.85"))
```

---

## `check_duplicate_face()` Function

```python
def check_duplicate_face(db_session, user_id, new_embedding, threshold=None):
    """
    Cek apakah wajah baru mirip dengan face yang sudah ada untuk user ini.

    Returns:
    {
        "is_duplicate": bool,
        "similarity": float,
        "existing_face_id": str | None,
        "existing_name": str | None
    }
    """
    from app.core.config import DUPLICATE_DETECTION_THRESHOLD

    if threshold is None:
        threshold = DUPLICATE_DETECTION_THRESHOLD

    # Convert numpy ke pgvector literal format
    emb_literal = '[' + ','.join(f'{x}' for x in new_embedding) + ']'

    # Top-1 similarity query (no threshold filter in WHERE - caller decide)
    query = text("""
        SELECT face_id, name,
               1 - (embedding <=> CAST(:q AS vector)) AS similarity
        FROM faces
        WHERE user_id = :uid
        ORDER BY embedding <=> CAST(:q AS vector)
        LIMIT 1
    """)

    row = db_session.execute(query, {
        'q': emb_literal,
        'uid': user_id
    }).fetchone()

    if row:
        similarity = float(row.similarity)
        return {
            "is_duplicate": similarity >= threshold,
            "similarity": round(similarity, 4),
            "existing_face_id": row.face_id,
            "existing_name": row.name
        }

    return {
        "is_duplicate": False,
        "similarity": 0.0,
        "existing_face_id": None,
        "existing_name": None
    }
```

---

## Response Format

**Normal (no duplicate):**
```json
{
    "status": "success",
    "embedding": [...],
    "liveness_score": 0.92,
    "quality": {...}
}
```

**With duplicate warning (allowed):**
```json
{
    "status": "success",
    "embedding": [...],
    "liveness_score": 0.92,
    "quality": {...},
    "duplicate_warning": {
        "is_duplicate": true,
        "similarity": 0.92,
        "existing_face_id": "user_123",
        "existing_name": "John Doe",
        "message": "Wajah ini mirip dengan user 'John Doe' (similarity: 92%). Yakin daftar ulang?"
    }
}
```

**Frontend behavior:**
- Show confirmation dialog dengan info existing face
- User bisa: lanjut register (sebagai face_id baru) atau cancel

---

## Integrasi

### Register Functions

**`process_register_live()` di `ml_service.py:307`:**
```python
def process_register_live(img, check_spoof=True, duplicate_threshold=None):
    faces = face_app.get(img)
    if len(faces) == 0:
        return {"status": "error", "message": "Face not detected"}
    if len(faces) > 1:
        return {"status": "error", "message": "Multiple faces detected"}

    face = faces[0]
    score = 1.0

    if check_spoof:
        score, is_real = check_liveness(img, face.bbox, kps=face.kps)
        if not is_real:
            return {
                "status": "error",
                "message": f"Liveness check failed (score: {score:.2f})"
            }

    # NEW: Duplicate check
    duplicate_info = check_duplicate_face(
        db_session, user_id, face.embedding, duplicate_threshold
    )

    response = {
        "status": "success",
        "embedding": face.embedding.tolist(),
        "liveness_score": score
    }

    if duplicate_info["is_duplicate"]:
        response["duplicate_warning"] = {
            **duplicate_info,
            "message": f"Wajah mirip dengan '{duplicate_info['existing_name']}' "
                       f"(similarity: {duplicate_info['similarity']*100:.1f}%). "
                       f"Yakin daftar ulang?"
        }

    return response
```

> **Catatan:** `db_session` dan `user_id` perlu di-pass ke `process_register_live()` dan `process_register_logic()`. Update signature.

---

## SQL Query

```sql
SELECT 
    face_id,
    name,
    1 - (embedding <=> CAST(:query_emb AS vector)) AS similarity
FROM faces
WHERE user_id = :user_id
ORDER BY embedding <=> CAST(:query_emb AS vector)
LIMIT 1;
```

> **Note:** Tidak ada threshold di WHERE clause. Query selalu return top-1, caller decide apakah duplicate atau bukan berdasarkan threshold 0.85.

---

## Future Enhancements (Phase 2)

- **Smart merge endpoint** — POST `/faces/:face_id/merge` untuk explicit merge dengan weighted average
- **Multi-sample storage** — Schema `face_samples(id, face_id, embedding, quality_score)` untuk multi-photo enrollment
- **Twin detection** — khusus log twin candidates untuk review

---

## File Changes

| File | Perubahan |
|------|-----------|
| `app/core/config.py` | `DUPLICATE_DETECTION_THRESHOLD` env var |
| `app/services/ml_service.py` | Tambah `check_duplicate_face()`, integrate ke register functions |
| `app/services/ml_service_raw.py` | Mirror same change |
| `app/controllers/face_controller.py` | Update function signatures untuk pass `db_session` + `user_id` |

---

## Effort

| Task | Effort |
|------|--------|
| `check_duplicate_face()` function | 1 jam |
| Integration ke register functions | 1 jam |
| Controller signature updates | 30 menit |
| Response schema updates | 30 menit |
| Testing same-person scenarios | 1 jam |
| **Total** | **~3-4 jam** |

---

## Status

- [x] Diskusi selesai - warn + allow, threshold 0.85
- [ ] Implementasi `check_duplicate_face()` di `ml_service.py`
- [ ] Mirror ke `ml_service_raw.py`
- [ ] Update register function signatures
- [ ] Update controllers untuk pass `db_session` + `user_id`
- [ ] Testing dengan sample data

---

## Catatan Tambahan

- **Performance cost minimal** — pgvector top-1 query pakai HNSW index, ~10-30ms latency tambahan. Sangat acceptable untuk register path (yang infrequent).
- **Privacy note** — duplicate detection hanya cek terhadap face milik user yang sama, tidak leak info antar tenant.
- **Tuning** — kalau false positive terlalu tinggi (orang beda terdeteksi duplicate), naikkan threshold ke 0.90. Kalau false negative (orang sama tidak terdeteksi), turunkan ke 0.80.
