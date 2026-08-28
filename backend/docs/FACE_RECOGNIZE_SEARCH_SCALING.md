# Face Recognition Search - Scaling Strategy (Poin #3)

> ⚠️ **SUPERSEDED** — Dokumen ini sudah digantikan oleh [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md).
>
> **Keputusan akhir:** Migrasi ke PostgreSQL + pgvector + Alembic (bukan FAISS atau Numpy vectorized).
> Alasan: Postgres sudah di roadmap untuk use case lain, pgvector memberi single source of truth dengan indexed ANN search di DB layer.
>
> Konten di bawah ini disimpan sebagai referensi historis dan perbandingan pendekatan alternatif.

**Topik:** Optimasi linear search → ANN (Approximate Nearest Neighbor)
**Referensi issue:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #3](./FACES_RECOGNIZE_ANALYSIS.md#3-linear-on-search-performance---high)
**Active plan:** [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md)
**Existing code:** `ml_service.py:639-643`

---

## Context

Loop linear search saat ini:

```python
# ml_service.py:639-643
for user in tenant_faces:
    sim = compute_similarity(target_embedding, user['embedding'])
    if sim > best_score:
        best_score = sim
        best_match = user
```

**Masalah:**
- Complexity **O(N)** per request — N = jumlah wajah yang terdaftar per tenant
- Tanpa indexing, setiap recognition harus hitung N cosine similarity
- CPU-bound, latency naik linear dengan jumlah registered faces

**Benchmark estimasi (ArcFace 512-d, single core):**
| Registered Faces | Latency (approx) |
|------------------|------------------|
| 100 | ~5 ms |
| 1,000 | ~50 ms |
| 10,000 | ~500 ms |
| 100,000 | ~5 s (unusable) |

---

## Strategi: 3 Level Optimasi (Bertahap)

Pilih level berdasarkan **scale aktual** & **complexity tradeoff**. Mulai dari paling sederhana.

### Level 1 — Vectorized NumPy (Quick Win, Low Effort)

**Tambah dependency:** Tidak ada (numpy sudah ada)

Ubah loop manual jadi matrix multiplication:

```python
# utils/face_index.py
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

class LinearFaceIndex:
    """Vectorized linear search — cocok untuk < 5,000 faces"""
    
    def __init__(self, faces: List[Dict[str, Any]]):
        self.metadata = []
        if faces:
            self.embeddings = np.vstack([
                np.asarray(f['embedding'], dtype=np.float32) for f in faces
            ])
            # Pre-normalize untuk dot product == cosine similarity
            norms = np.linalg.norm(self.embeddings, axis=1, keepdims=True)
            self.embeddings = self.embeddings / np.maximum(norms, 1e-10)
            self.metadata = [{'id': f['id'], 'name': f['name'], 'image_url': f.get('image_url')} for f in faces]
    
    def search(self, query_embedding: np.ndarray, top_k: int = 1, threshold: float = 0.5) -> List[Tuple[float, Dict]]:
        q = np.asarray(query_embedding, dtype=np.float32)
        q = q / max(np.linalg.norm(q), 1e-10)
        
        # Single matrix multiply — semua similarity dalam 1 operasi
        sims = self.embeddings @ q  # shape: (N,)
        
        # Get top-k indices
        top_indices = np.argsort(-sims)[:top_k]
        
        results = []
        for idx in top_indices:
            score = float(sims[idx])
            if score >= threshold:
                results.append((score, self.metadata[idx]))
        return results
```

**Speedup:** 10-50x lebih cepat dari loop Python biasa (tergantung jumlah data).

**Limit:** Masih O(N) memory, semua embedding harus di RAM sekaligus.

**Estimasi effort:** 2-4 jam (refactor + test).

---

### Level 2 — FAISS Integration (Medium Scale, 5K-1M faces)

**Tambah dependency:**

```txt
# requirements.txt
faiss-cpu>=1.7.4   # CPU-only, tidak butuh CUDA
```

> Alternatif GPU: `faiss-gpu` (perlu CUDA, lebih cepat 10-100x tapi setup lebih ribet). Untuk server production tanpa GPU dedicated, `faiss-cpu` cukup.

**Index type:** `IndexFlatIP` (Inner Product = cosine similarity kalau embeddings sudah L2-normalized). Exact search, tapi pakai BLAS optimized.

**Untuk scale lebih besar, pindah ke:**
- `IndexIVFFlat` — inverted file, training-based, ~10x speedup
- `IndexHNSWFlat` — graph-based, ~100x speedup, recall tinggi

```python
# utils/face_index.py
import faiss
import numpy as np
from typing import List, Dict, Any, Tuple

class FAISSFaceIndex:
    """FAISS-based index. Cocok untuk 5,000+ faces per tenant."""
    
    def __init__(self, dim: int = 512, use_ivf: bool = False, nlist: int = 100):
        self.dim = dim
        self.metadata: List[Dict] = []
        self.use_ivf = use_ivf
        
        if use_ivf:
            # IVF butuh training — untuk tenant kecil < 5K, FlatIP lebih simple
            quantizer = faiss.IndexFlatIP(dim)
            self.index = faiss.IndexIVFFlat(quantizer, dim, nlist, faiss.METRIC_INNER_PRODUCT)
            self.is_trained = False
        else:
            # Exact search, BLAS optimized. Best untuk < 100K faces
            self.index = faiss.IndexFlatIP(dim)
            self.is_trained = True
    
    def add(self, embeddings: np.ndarray, metadata: List[Dict]):
        """Tambah embeddings + metadata"""
        embeddings = np.ascontiguousarray(embeddings.astype('float32'))
        # Normalize L2 — penting supaya inner product == cosine similarity
        faiss.normalize_L2(embeddings)
        
        if self.use_ivf and not self.is_trained:
            # IVF butuh training data minimal nlist samples
            if len(embeddings) >= self.index.nlist:
                self.index.train(embeddings)
                self.is_trained = True
            else:
                # Fallback ke flat kalau data belum cukup untuk IVF
                self.use_ivf = False
                self.index = faiss.IndexFlatIP(self.dim)
                self.is_trained = True
        
        self.index.add(embeddings)
        self.metadata.extend(metadata)
    
    def search(self, query: np.ndarray, top_k: int = 5, threshold: float = 0.5) -> List[Tuple[float, Dict]]:
        query = np.ascontiguousarray(query.astype('float32')).reshape(1, -1)
        faiss.normalize_L2(query)
        
        scores, indices = self.index.search(query, top_k)
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:  # FAISS return -1 untuk slot kosong
                continue
            if score < threshold:
                continue
            results.append((float(score), self.metadata[idx]))
        return results
    
    def remove(self, face_id: str):
        """Rebuild index tanpa face_id tertentu (FAISS tidak support direct delete)"""
        # Implementasi: rebuild dari metadata yang masih ada
        # Atau simpan `valid_ids` mask, tapi tetap tidak bisa delete dari index
        pass
    
    @property
    def size(self) -> int:
        return self.index.ntotal
```

**Speedup:**
| Method | Speed (1K faces) | Speed (100K faces) | Recall |
|--------|------------------|--------------------|--------|
| Python loop | ~50 ms | ~5 s | 100% (exact) |
| Numpy vectorized | ~5 ms | ~500 ms | 100% (exact) |
| FAISS FlatIP | ~2 ms | ~150 ms | 100% (exact) |
| FAISS IVFFlat | ~1 ms | ~15 ms | ~95% |
| FAISS HNSW | ~0.5 ms | ~5 ms | ~99% |

**Estimasi effort:** 1-2 hari (install + integrasi + cache invalidation).

---

### Level 3 — Multi-Tenant Cache Layer (Advanced)

Untuk sistem dengan **banyak tenant**, setiap tenant punya index sendiri.

**Pattern: Per-Tenant In-Memory Cache**

```python
# services/face_index_cache.py
from typing import Dict
from threading import Lock
import time

class TenantIndexCache:
    """Cache face index per tenant dengan TTL & manual invalidation"""
    
    def __init__(self, ttl_seconds: int = 3600):
        self._cache: Dict[int, dict] = {}  # user_id -> {'index': ..., 'loaded_at': ...}
        self._lock = Lock()
        self._ttl = ttl_seconds
    
    def get_or_build(self, user_id: int, db_session, index_class):
        with self._lock:
            entry = self._cache.get(user_id)
            if entry and (time.time() - entry['loaded_at']) < self._ttl:
                return entry['index']
            
            # Build/rebuild index
            faces = get_tenant_faces(db_session, user_id)
            index = index_class(dim=512)
            if faces:
                embeddings = np.vstack([np.array(f['embedding'], dtype=np.float32) for f in faces])
                metadata = [{'id': f['id'], 'name': f['name'], 'image_url': f['image_url']} for f in faces]
                index.add(embeddings, metadata)
            
            self._cache[user_id] = {'index': index, 'loaded_at': time.time()}
            return index
    
    def invalidate(self, user_id: int):
        """Dipanggil setelah register/delete face"""
        with self._lock:
            self._cache.pop(user_id, None)
    
    def clear_all(self):
        with self._lock:
            self._cache.clear()


# Global singleton
index_cache = TenantIndexCache()
```

**Invalidation hooks:**

```python
# face_controller.py - di endpoint register/delete
async def register_face_endpoint(...):
    # ... existing code untuk save ...
    index_cache.invalidate(current_user.id)  # Tambah ini
```

**Estimasi effort:** 4-6 jam (refactor + thread safety + invalidation hooks).

---

## Rekomendasi Berdasarkan Scale

| Scale (Faces/Tenant) | Rekomendasi | Alasan |
|----------------------|-------------|--------|
| < 1,000 | **Level 1** (Numpy vectorized) | Simple, no extra deps |
| 1,000 - 50,000 | **Level 2** (FAISS FlatIP) | Exact, performant |
| 50,000 - 500,000 | **Level 2 + IVFFlat/HNSW** | ANN, trade sedikit recall |
| 500,000 + | **Level 2 + Level 3** | Multi-tenant cache wajib |
| Multi-server / Docker scale | **Level 2 + Redis cache** | Shared state antar worker |

---

## Decision Matrix

| Faktor | Level 1 (Numpy) | Level 2 (FAISS) | Level 3 (Cache + FAISS) |
|--------|-----------------|-----------------|-------------------------|
| Extra dependency | ❌ | ✅ faiss-cpu | ✅ faiss-cpu |
| Setup complexity | Low | Medium | High |
| Memory overhead | O(N) raw | O(N) + index overhead | O(N) × tenants |
| Latency @ 10K faces | ~500 ms | ~15 ms | ~15 ms |
| Multi-thread safe | Easy | Easy | Perlu lock |
| Production-ready | Untuk small | ✅ | ✅ |

---

## Migrasi Bertahap (Recommended Path)

1. **Sekarang:** Level 1 (vectorized numpy) — quick win, no new dep
2. **Saat > 1K faces/tenant:** Tambah FAISS, refactor pakai abstraction `FaceIndex` interface
3. **Saat multi-worker / multi-tenant berat:** Tambah Redis-backed cache

**Refactor pattern:** Buat `FaceIndex` sebagai abstract class dengan 2 implementation (`LinearFaceIndex`, `FAISSFaceIndex`). Swap via config.

```python
# utils/face_index.py
from abc import ABC, abstractmethod

class FaceIndex(ABC):
    @abstractmethod
    def add(self, embeddings, metadata): ...
    
    @abstractmethod
    def search(self, query, top_k, threshold): ...
    
    @abstractmethod
    def remove(self, face_id): ...

# Pilihan implementation via env var
INDEX_TYPE = os.getenv("FACE_INDEX_TYPE", "linear")  # "linear" | "faiss"
```

Dengan cara ini, perpindahan dari Level 1 ke Level 2 = ganti env var, tidak ubah kode logic.

---

## Status

- [x] Diskusi strategi awal — sepakat pakai pendekatan bertahap
- [x] **SUPERSEDED oleh FACE_RECOGNIZE_PGVECTOR_MIGRATION.md** (2026-08-28)
- [ ] (Tidak applicable) Implementasi Level 1/2/3 — sudah pindah ke pgvector approach

---

## Catatan Tambahan

- **InsightFace embeddings sudah 512-d & L2-normalized** — perfect untuk cosine similarity via dot product
- **FAISS `IndexFlatIP` di-build saat register face, re-build saat delete** — bisa pakai event-based invalidation atau periodic rebuild (cron tiap X menit)
- **Lock contention:** Kalau pakai in-memory cache dengan thread pool executor, gunakan `threading.RLock` atau process-shared cache (Redis) untuk hindari bottleneck
- **Cosine vs Euclidean:** ArcFace pakai cosine, jadi `IndexFlatIP` + normalized vectors sudah benar. Jangan pakai `IndexFlatL2`
