# Face Recognize Endpoint - Analysis & Optimization

**Endpoint:** `POST /faces/recognize`
**File ref:** `app/controllers/face_controller.py:522`
**Logic ref:** `app/services/ml_service.py:616` (`process_recognize_logic`)

---

## Current Flow

1. Terima upload image (max 5MB)
2. Decode dengan `cv2.imdecode`
3. `get_tenant_faces()` query dari database
4. InsightFace Buffalo-L → detect face + extract ArcFace embedding
5. Loop cosine similarity terhadap semua tenant faces (linear search)
6. Return match jika similarity > 0.50

---

## Issues Identified

### 1. No Liveness Check (Security - HIGH)

Liveness detection di-comment out di `ml_service.py:629-633`:

```python
# Liveness check disabled as requested
# score, is_real = check_liveness(img, target_face.bbox)
# if not is_real:
#     return {"status": "error", "message": "Spoof face detected"}
```

**Dampak:** Vulnerable terhadap photo/video replay attack.

**Fix:**
- Enable `check_liveness()` sebelum similarity matching
- Tambahkan parameter `mode=liveness_identify` seperti di `process_recognize_live` (line 459)

**Status:** Pending — cuma uncomment, ready kapan saja

---

### 2. Hardcoded Threshold 0.50 (Config - HIGH)

```python
# ml_service.py:645
if best_score > 0.50:
```

**Dampak:** 0.50 cukup permisif untuk ArcFace. Tidak bisa tuning per use case.

**Fix:** Env-configurable per use case (3-layer config).

**Status:** ✅ Designed — [FACE_RECOGNIZE_THRESHOLD.md](./FACE_RECOGNIZE_THRESHOLD.md)

---

### 3. Linear O(N) Search (Performance - HIGH)

```python
# ml_service.py:639-643
for user in tenant_faces:
    sim = compute_similarity(target_embedding, user['embedding'])
    if sim > best_score:
        best_score = sim
        best_match = user
```

**Dampak:** O(N) latency, tidak scalable.

**Fix:**
- ✅ **RESOLVED** — Migrasi ke PostgreSQL + pgvector dengan HNSW index
- Lihat: [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md)

**Status:** ✅ Resolved via pgvector

---

### 4. No Embedding Caching (Performance - MEDIUM)

```python
# face_controller.py:540 - Setiap request query DB
tenant_faces = get_tenant_faces(db_session, current_user.id)
```

**Dampak:** DB query tiap request + JSON deserialize.

**Analisis Setelah Poin #3:** Setelah pgvector migration, bottleneck CPU loop hilang. pgvector sudah handle indexed search ~20ms. Cache value marginal.

**Status:** ⏸️ DEFER — skip sampai scale membuktikan perlu

---

### 5. No Face Quality Assessment (Accuracy - MEDIUM)

**Dampak:** Gambar blur/gelap/pose ekstrem tetap diproses → hasil tidak akurat.

**Fix:**
- Hybrid: **gate** (hard reject kalau unusable) + **score** (return quality metadata)
- Both paths: register + recognize
- Env-configurable thresholds
- No threshold adjustment (quality sebagai info saja)

**Status:** ✅ Designed — [FACE_RECOGNIZE_QUALITY_CHECK.md](./FACE_RECOGNIZE_QUALITY_CHECK.md)

---

### 6. No Duplicate Detection (Data Quality - MEDIUM)

**Dampak:** User bisa register wajah orang sama dengan `face_id` beda → DB bengkak + ambiguous recognition.

**Fix:**
- Detection via pgvector top-1 similarity (reuse Poin #3 infrastructure)
- Threshold: 0.85 (env-configurable)
- Behavior: **Warn + Allow** (frontend decide)
- No multi-sample storage (defer)

**Status:** ✅ Designed — [FACE_RECOGNIZE_DUPLICATE_DETECTION.md](./FACE_RECOGNIZE_DUPLICATE_DETECTION.md)

---

### 7. Missing Features (LOW)

**Audit Log:**
- Tidak ada record recognition attempts

**Top-K Candidates:**
- Hanya return best match, tidak bisa return alternatif

**Fix:**
- New `recognition_logs` table — log semua events (match/no_match/error)
- Cron cleanup, 90-day retention (env-configurable)
- Top-K: default 1, opt-in via `?top_k=N`, max 10

**Status:** ✅ Designed — [FACE_RECOGNIZE_AUDIT_TOPK.md](./FACE_RECOGNIZE_AUDIT_TOPK.md)

---

## Priority Matrix

| # | Priority | Issue | Impact | Est. Effort | Status |
|---|----------|-------|--------|-------------|--------|
| 1 | HIGH | No Liveness Check | Security | 2-4 hours | Pending (uncomment) |
| 2 | HIGH | Hardcoded Threshold | False Positive | 2 hours | ✅ Designed |
| 3 | HIGH | Linear O(N) Search | Scalability | 3-4 days | ✅ Resolved via pgvector |
| 4 | MEDIUM | No Embedding Cache | Latency | 4 hours | ⏸️ DEFER |
| 5 | MEDIUM | No Quality Check | Accuracy | 6 hours | ✅ Designed |
| 6 | MEDIUM | No Duplicate Detection | Data Quality | 3-4 hours | ✅ Designed |
| 7 | LOW | No Audit + Top-K | Features | 8-9 hours | ✅ Designed |

---

## Status Diskusi

- [ ] Discuss #1 - Liveness Check (trivial, cuma uncomment)
- [x] Discuss #2 - Threshold Config → [FACE_RECOGNIZE_THRESHOLD.md](./FACE_RECOGNIZE_THRESHOLD.md)
- [x] Discuss #3 - pgvector Migration → [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md)
- [x] Discuss #4 - Embedding Cache → **DEFER** (no longer critical after Poin #3)
- [x] Discuss #5 - Face Quality Check → [FACE_RECOGNIZE_QUALITY_CHECK.md](./FACE_RECOGNIZE_QUALITY_CHECK.md)
- [x] Discuss #6 - Duplicate Detection → [FACE_RECOGNIZE_DUPLICATE_DETECTION.md](./FACE_RECOGNIZE_DUPLICATE_DETECTION.md)
- [x] Discuss #7 - Audit + Top-K → [FACE_RECOGNIZE_AUDIT_TOPK.md](./FACE_RECOGNIZE_AUDIT_TOPK.md)

---

## Implementation Order (Rekomendasi)

### Phase A — Quick Wins (1-2 hari)
1. **Poin #1** — Uncomment liveness check
2. **Poin #2** — Implement env-configurable threshold
3. **Poin #5** — Hybrid quality check

### Phase B — Database Migration (3-4 hari)
4. **Poin #3** — Migrasi ke Postgres + pgvector + Alembic

### Phase C — Advanced Features (2-3 hari)
5. **Poin #6** — Duplicate detection (reuses Poin #3 infrastructure)
6. **Poin #7** — Audit log + top-K candidates

### Skipped
- **Poin #4** — Embedding cache (defer sampai scale proves necessary)

---

## Rekap Semua Dokumen

| Poin | Topik | File |
|-------|-------|------|
| #2 | Threshold configuration | [FACE_RECOGNIZE_THRESHOLD.md](./FACE_RECOGNIZE_THRESHOLD.md) |
| #3 | pgvector migration (primary) | [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md) |
| #3 | FAISS approach (superseded) | [FACE_RECOGNIZE_SEARCH_SCALING.md](./FACE_RECOGNIZE_SEARCH_SCALING.md) |
| #5 | Face quality check | [FACE_RECOGNIZE_QUALITY_CHECK.md](./FACE_RECOGNIZE_QUALITY_CHECK.md) |
| #6 | Duplicate detection | [FACE_RECOGNIZE_DUPLICATE_DETECTION.md](./FACE_RECOGNIZE_DUPLICATE_DETECTION.md) |
| #7 | Audit log + top-K | [FACE_RECOGNIZE_AUDIT_TOPK.md](./FACE_RECOGNIZE_AUDIT_TOPK.md) |

---

## Total Effort Estimate

| Phase | Items | Effort |
|-------|-------|--------|
| A | Poin #1, #2, #5 | ~10-12 jam |
| B | Poin #3 (pgvector migration) | ~3-4 hari |
| C | Poin #6, #7 | ~12-13 jam |
| **Total** | All (except #4) | **~6-7 hari kerja** |
