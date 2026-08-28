# Face Recognition Audit Log + Top-K Candidates - Design (Poin #7)

**Topik:** Audit trail untuk recognition attempts + multi-candidate results
**Referensi issue:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #7](./FACES_RECOGNIZE_ANALYSIS.md#7-missing-features-low)
**Related:** [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md)

---

## Context

Poin #7 terdiri dari 2 fitur terpisah yang saling melengkapi:

1. **Audit Log** — tidak ada jejak recognition attempts (untuk debugging, security, compliance)
2. **Top-K Candidates** — hanya return best match, tidak bisa return alternatif

---

## 7A — Audit Log

### Keputusan Final

| Aspek | Keputusan |
|-------|-----------|
| Scope | **Log semua events** (match, no_match, error) |
| Storage | **Tabel `recognition_logs` baru** di Postgres |
| Retention | **Cron cleanup, 90 hari default** (env-configurable) |
| Privacy | **No image logging**, hanya metadata |

### Schema

**Tabel baru `recognition_logs`:**
```python
class RecognitionLog(Base):
    __tablename__ = "recognition_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    endpoint = Column(String(100))
    mode = Column(String(50), nullable=True)
    result = Column(String(20), index=True)  # match, no_match, error
    matched_face_id = Column(String(100), nullable=True, index=True)
    similarity_score = Column(Float, nullable=True)
    top_k_count = Column(Integer, default=1)
    latency_ms = Column(Float)
    ip_address = Column(String(45), nullable=True)  # IPv6 max 45 chars
    user_agent = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    quality_score = Column(Float, nullable=True)
    liveness_score = Column(Float, nullable=True)

    __table_args__ = (
        Index('ix_recog_log_user_time', 'user_id', 'timestamp'),
        Index('ix_recog_log_result_time', 'result', 'timestamp'),
    )
```

### Fields yang Di-Log

| Field | Type | Deskripsi |
|-------|------|-----------|
| `timestamp` | DateTime | Kapan request masuk |
| `user_id` | Integer (FK) | Tenant pemilik endpoint |
| `endpoint` | String | `/faces/recognize`, `/recognize/multi`, dll |
| `mode` | String | identify, liveness, dll |
| `result` | String | `match` / `no_match` / `error` |
| `matched_face_id` | String | face_id kalau match |
| `similarity_score` | Float | Skor similarity |
| `top_k_count` | Integer | Jumlah kandidat di-return |
| `latency_ms` | Float | Processing time |
| `ip_address` | String | IP caller |
| `user_agent` | String | Browser/app info |
| `error_message` | String | Kalau error |
| `quality_score` | Float | Poin #5 quality check |
| `liveness_score` | Float | Poin #1 liveness check |

### Indexes

- `(timestamp, user_id)` — query "recognition hari ini untuk user X"
- `(result, timestamp)` — analytics success rate
- `(matched_face_id, timestamp)` — track specific face activity

### `log_recognition()` Function

```python
def log_recognition(
    db_session,
    user_id: int,
    endpoint: str,
    result: str,
    matched_face_id: str | None = None,
    similarity_score: float | None = None,
    top_k_count: int = 1,
    latency_ms: float = 0.0,
    ip_address: str | None = None,
    user_agent: str | None = None,
    error_message: str | None = None,
    quality_score: float | None = None,
    liveness_score: float | None = None,
):
    log = RecognitionLog(
        user_id=user_id,
        endpoint=endpoint,
        result=result,
        matched_face_id=matched_face_id,
        similarity_score=similarity_score,
        top_k_count=top_k_count,
        latency_ms=latency_ms,
        ip_address=ip_address,
        user_agent=user_agent,
        error_message=error_message,
        quality_score=quality_score,
        liveness_score=liveness_score,
    )
    db_session.add(log)
    db_session.commit()
```

### Cleanup Cron Script

**`scripts/cron/cleanup_recognition_logs.py`:**
```python
"""Cron job: hapus recognition logs > retention_days."""
import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from backend.app.core.config import (
    DATABASE_URL, RECOGNITION_LOG_RETENTION_DAYS
)

def cleanup():
    engine = create_engine(DATABASE_URL)
    cutoff = datetime.utcnow() - timedelta(days=RECOGNITION_LOG_RETENTION_DAYS)

    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM recognition_logs WHERE timestamp < :cutoff"),
            {"cutoff": cutoff}
        )
        conn.commit()
        print(f"[cleanup_recognition_logs] Deleted {result.rowcount} "
              f"logs older than {cutoff}")

if __name__ == "__main__":
    cleanup()
```

**Cron schedule (run daily at 02:00):**
```bash
0 2 * * * cd /app && python -m scripts.cron.cleanup_recognition_logs
```

### Privacy Concerns

| Concern | Mitigation |
|---------|------------|
| Image storage | **NEVER log the image** — hanya metadata |
| IP logging | Bisa di-hash atau truncated |
| GDPR compliance | Dokumentasi jelaskan data retention |
| Admin disable | Configurable via env (`AUDIT_LOG_ENABLED=true`) |

---

## 7B — Top-K Candidates

### Keputusan Final

| Aspek | Keputusan |
|-------|-----------|
| Default behavior | **top_k=1** (backward compatible) |
| Activation | **Opt-in via query param** `?top_k=N` |
| Max cap | **10** (env-configurable) |
| Threshold filter | **Tidak di SQL WHERE** — return semua top-K |

### SQL Query Modification

**Current (Poin #3 pgvector, top_k=1):**
```sql
SELECT face_id, name, image_url, 
       1 - (embedding <=> CAST(:q AS vector)) AS similarity
FROM faces
WHERE user_id = :uid 
  AND 1 - (embedding <=> CAST(:q AS vector)) >= :threshold
ORDER BY embedding <=> CAST(:q AS vector)
LIMIT 1
```

**Top-K version:**
```sql
SELECT face_id, name, image_url,
       1 - (embedding <=> CAST(:q AS vector)) AS similarity
FROM faces
WHERE user_id = :uid
ORDER BY embedding <=> CAST(:q AS vector)
LIMIT :k
```

> **Catatan:** Hapus threshold dari WHERE clause. Return semua top-K, caller filter berdasarkan `similarity >= threshold`.

### Response Format

**Single match (backward compatible, top_k=1):**
```json
{
    "status": "success",
    "match": true,
    "data": {
        "id": "user_123",
        "name": "John Doe",
        "image_url": "...",
        "similarity": 0.82
    }
}
```

**Top-K (`?top_k=5`):**
```json
{
    "status": "success",
    "match": true,
    "data": {
        "id": "user_123",
        "name": "John Doe",
        "image_url": "...",
        "similarity": 0.82
    },
    "candidates": [
        {"id": "user_123", "name": "John Doe", "similarity": 0.82, "image_url": "..."},
        {"id": "user_456", "name": "Jane Smith", "similarity": 0.71, "image_url": "..."},
        {"id": "user_789", "name": "Bob Wilson", "similarity": 0.68, "image_url": "..."}
    ],
    "threshold_used": 0.65
}
```

**Behavior:**
- Kalau top-1 di atas threshold → `match=true`, tetap return all candidates
- Kalau tidak ada yang di atas threshold → `match=false`, tapi tetap return top-K untuk inspection

### Endpoint Signature

```python
async def recognize_endpoint(
    file: UploadFile = File(...),
    top_k: int = Query(1, ge=1, le=10),
    threshold: float | None = Query(None, ge=0.0, le=1.0),
    current_user: db_models.User = Depends(get_current_user),
    db_session: Session = Depends(db.get_db)
):
    effective_top_k = min(top_k, MAX_TOP_K)
    # ...
```

### Config

```python
# app/core/config.py
DEFAULT_TOP_K = int(os.getenv("DEFAULT_TOP_K", "1"))
MAX_TOP_K = int(os.getenv("MAX_TOP_K", "10"))
RECOGNITION_LOG_RETENTION_DAYS = int(os.getenv("RECOGNITION_LOG_RETENTION_DAYS", "90"))
AUDIT_LOG_ENABLED = os.getenv("AUDIT_LOG_ENABLED", "true").lower() == "true"
```

---

## Integrasi dengan Poin Lain

| Poin | Field di Log |
|------|--------------|
| #1 (Liveness) | `liveness_score` |
| #5 (Quality) | `quality_score` |
| #6 (Duplicate) | `error_message` bisa contain duplicate info |
| #3 (pgvector) | Top-K query sangat murah dengan HNSW |

---

## File Changes

| File | Perubahan |
|------|-----------|
| `app/database/models.py` | Tambah `RecognitionLog` model |
| `alembic/versions/xxx_add_recognition_logs.py` | NEW migration |
| `app/services/ml_service.py` | Tambah `log_recognition()`, integrate ke recognize functions, top-K support |
| `app/services/ml_service_raw.py` | Mirror same change |
| `app/controllers/face_controller.py` | Tambah `top_k` query param, IP/UA extraction |
| `app/core/config.py` | Top-K defaults + retention period |
| `scripts/cron/cleanup_recognition_logs.py` | NEW cleanup script |

---

## Behavior Summary

| Feature | Default | Override | Use Case |
|---------|---------|----------|----------|
| Top-K | 1 | `?top_k=N` | Manual verification, threshold tuning |
| Audit log | Always on | `AUDIT_LOG_ENABLED=false` | Compliance, debugging |
| Retention | 90 days | env var | Storage management |

---

## Effort

| Task | Effort |
|------|--------|
| `RecognitionLog` model + Alembic migration | 1.5 jam |
| `log_recognition()` function | 1 jam |
| Integration ke recognize endpoints (5 endpoints) | 2 jam |
| Top-K query modification + response | 1.5 jam |
| Controller updates (IP/UA extraction) | 30 menit |
| Cleanup cron script | 1 jam |
| Testing | 1 jam |
| **Total** | **~8-9 jam** |

---

## Status

- [x] Diskusi selesai - log all events, top_k=1 default, 90-day retention
- [ ] Tambah `RecognitionLog` model di `models.py`
- [ ] Generate Alembic migration
- [ ] Implementasi `log_recognition()` di `ml_service.py`
- [ ] Mirror ke `ml_service_raw.py`
- [ ] Integration ke recognize endpoints
- [ ] Top-K query + response modification
- [ ] Cleanup cron script
- [ ] Testing

---

## Catatan Tambahan

- **Storage growth** — high traffic bisa generate banyak logs. Cleanup cron mitigasi, tapi monitor DB size.
- **Top-K cap** — MAX_TOP_K=10 cukup untuk kebanyakan use case. Kalau lebih besar, bisa slow karena return banyak candidates.
- **Privacy** — untuk compliance (GDPR), pastikan dokumentasi jelas tentang apa yang di-log dan retention policy.
- **Audit log endpoint** — belum ada endpoint untuk query logs. Bisa ditambahkan di Phase 2 (admin endpoint untuk review audit trail).
