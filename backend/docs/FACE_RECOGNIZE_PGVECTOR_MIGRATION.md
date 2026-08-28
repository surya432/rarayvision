# Face Recognition - Migrasi MariaDB → PostgreSQL + pgvector + Alembic

**Endpoint target:** `POST /faces/recognize` (optimasi poin #3)
**Issue reference:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #3](./FACES_RECOGNIZE_ANALYSIS.md#3-linear-on-search-performance---high)
**Supersedes:** [FACE_RECOGNIZE_SEARCH_SCALING.md](./FACE_RECOGNIZE_SEARCH_SCALING.md) (FAISS approach)
**Status:** Plan final — siap dieksekusi

---

## Tujuan

Mengganti linear O(N) search di `ml_service.py:639-643` dengan indexed ANN search di DB layer, sekaligus setup migration tooling yang scalable untuk project.

## Keputusan Final

| Keputusan | Value | Alasan |
|-----------|-------|--------|
| DB engine | PostgreSQL 16 + pgvector | Single source of truth, indexed vector search |
| Vector storage | `Column(Vector(512))` | Native pgvector, bukan TEXT(JSON) |
| Index type | HNSW (`vector_cosine_ops`) | Recall tinggi, performa excellent untuk cosine similarity |
| Migration tool | Alembic | Versioned schema changes, track history |
| Cutover | Hard cutover | Belum production, acceptable |
| Data existing | Tidak dimigrate | Fresh start di Postgres (no important data yet) |
| MariaDB service | Dihapus dari docker-compose | Full replacement, clean slate |

---

## Struktur File yang Berubah

### File Baru (3)

```
rarayvision/
├── alembic.ini                                # Alembic config
├── scripts/
│   └── init_pgvector.sql                      # Enable pgvector extension on container init
├── backend/
│   ├── alembic/                               # Alembic migrations folder
│   │   ├── env.py                             # DB connection + metadata target
│   │   ├── script.py.mako                     # Template (auto-generated)
│   │   └── versions/
│   │       └── xxxx_init_pgvector_schema.py   # Initial migration
```

### File yang Diubah (4)

```
backend/
├── app/
│   ├── core/config.py                         # DATABASE_URL default ke Postgres
│   ├── database/models.py                     # embedding → Vector(512) + HNSW index
│   └── services/
│       ├── ml_service.py                      # Hapus json.loads/dumps, pakai SQL <=>
│       └── ml_service_raw.py                  # Sama seperti ml_service.py
├── docker-compose.yml                         # Ganti mariadb → pgvector image
├── requirements.txt                           # Tambah deps, hapus PyMySQL
└── (controllers di-update via refactor)
```

---

## Fase Implementasi

### Fase 1 — Dependencies & Infrastructure (3 jam)

**1.1. Update `requirements.txt`:**

```diff
- PyMySQL==1.1.0
+ psycopg2-binary>=2.9.9
+ pgvector>=0.3.6
+ alembic>=1.13.0
```

> **Catatan:** `cryptography` tetap dipakai (untuk JWT), tidak perlu dihapus.

**1.2. Update `docker-compose.yml`:**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16    # Was: mariadb:10.11
    container_name: rarayvision-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:-rarayvision}
      POSTGRES_USER: ${DB_USER:-raray}
      POSTGRES_PASSWORD: ${DB_PASS:-}
    volumes:
      - db_data:/var/lib/postgresql/data     # Was: /var/lib/mysql
      - ./scripts/init_pgvector.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - raray-network
```

**1.3. Buat `scripts/init_pgvector.sql`:**

```sql
-- Enable pgvector extension saat container pertama kali start
CREATE EXTENSION IF NOT EXISTS vector;
```

**Validasi Fase 1:**

```bash
docker-compose down -v        # Drop MariaDB volume lama
docker-compose up -d db       # Postgres container jalan
docker exec -it rarayvision-db psql -U raray -d rarayvision -c "\dx"
# Harus muncul: vector | ...
```

---

### Fase 2 — Config Update (30 menit)

**Update `app/core/config.py`:**

```python
# SEBELUM:
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER", "raray")
    DB_PASS = os.getenv("DB_PASS", "yourpassword")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_NAME = os.getenv("DB_NAME", "rarayvision")
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

# SESUDAH:
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER", "raray")
    DB_PASS = os.getenv("DB_PASS", "yourpassword")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_NAME = os.getenv("DB_NAME", "rarayvision")
    DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"
```

> **Catatan:** Logic `if sqlite:` di `database.py:5` tetap dibiarkan — handle edge case kalau ada yang pakai SQLite untuk testing lokal.

---

### Fase 3 — Alembic Setup (2-3 jam)

**3.1. Init alembic:**

```bash
cd backend
alembic init alembic
```

**3.2. Edit `alembic/env.py`** — tambahkan import & set target_metadata:

```python
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import engine_from_config, pool
from alembic import context

from backend.app.database.models import Base
from backend.app.core.config import DATABASE_URL

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)
target_metadata = Base.metadata    # Connect alembic ke models.py
```

**3.3. Update `alembic.ini`** (cari line `script_location`):

```ini
script_location = backend/alembic
prepend_sys_path = .
```

---

### Fase 4 — Models Update (1 jam)

**Update `app/database/models.py`:**

```python
import uuid
import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector    # NEW
from backend.app.database.database import Base

class User(Base):
    __tablename__ = "users"
    # ... unchanged ...

class ApiKey(Base):
    __tablename__ = "api_keys"
    # ... unchanged ...

class Face(Base):
    __tablename__ = "faces"

    internal_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    face_id = Column(String(100), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    embedding = Column(Vector(512), nullable=False)    # CHANGED from Text
    image_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="faces")

    __table_args__ = (
        Index(
            'ix_faces_user_embedding_hnsw',     # NEW
            'user_id', 'embedding',
            postgresql_using='hnsw',
            postgresql_ops={'embedding': 'vector_cosine_ops'}
        ),
    )
```

---

### Fase 5 — Generate Initial Migration (30 menit)

**5.1. Generate auto-migration:**

```bash
alembic revision --autogenerate -m "init: pgvector schema with HNSW index"
```

**5.2. Review & enhance file di `alembic/versions/xxxx_init_pgvector_schema.py`:**

```python
"""init: pgvector schema with HNSW index

Revision ID: xxxx
Revises:
Create Date: 2026-xx-xx
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = 'xxxx'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Schema users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('store_images', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_id', 'users', ['id'])

    # Schema api_keys
    op.create_table(
        'api_keys',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('key_string', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_api_keys_key_string', 'api_keys', ['key_string'], unique=True)
    op.create_index('ix_api_keys_id', 'api_keys', ['id'])

    # Schema faces dengan Vector(512)
    op.create_table(
        'faces',
        sa.Column('internal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('face_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('embedding', Vector(512), nullable=False),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('internal_id')
    )
    op.create_index('ix_faces_id', 'faces', ['internal_id'])
    op.create_index('ix_faces_user_id', 'faces', ['user_id'])
    op.create_index('ix_faces_face_id', 'faces', ['face_id'])

    # HNSW index - manual karena auto-gen tidak handle
    op.execute("""
        CREATE INDEX ix_faces_user_embedding_hnsw
        ON faces USING hnsw (embedding vector_cosine_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_faces_user_embedding_hnsw")
    op.drop_index('ix_faces_face_id', table_name='faces')
    op.drop_index('ix_faces_user_id', table_name='faces')
    op.drop_index('ix_faces_id', table_name='faces')
    op.drop_table('faces')
    op.drop_index('ix_api_keys_id', table_name='api_keys')
    op.drop_index('ix_api_keys_key_string', table_name='api_keys')
    op.drop_table('api_keys')
    op.drop_index('ix_users_id', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
```

**5.3. Apply migration:**

```bash
alembic upgrade head
```

**Validasi Fase 5:**

```bash
docker exec -it rarayvision-db psql -U raray -d rarayvision
\dt                                    # Tables: users, api_keys, faces
\d faces                               # embedding | vector(512) | not null
\di ix_faces_user_embedding_hnsw       # HNSW index exists
```

---

### Fase 6 — Code Refactor (4-6 jam)

**6.1. Update `app/services/ml_service.py`:**

**`get_tenant_faces()` (line 72-86):**

```python
def get_tenant_faces(db_session, user_id):
    """Load faces for tenant - pgvector native, no JSON parse"""
    faces = db_session.query(db_models.Face).filter(db_models.Face.user_id == user_id).all()
    result = []
    for row in faces:
        result.append({
            "id": row.face_id,
            "name": row.name,
            "image_url": row.image_url,
            "embedding": np.array(row.embedding, dtype=np.float32),  # Direct
        })
    return result
```

**`save_face_to_db()` (line 88-100):**

```python
def save_face_to_db(db_session, user_id, face_id, name, embedding, image_url=None):
    """Save face embedding - pgvector native, no JSON serialize"""
    emb_array = np.array(embedding, dtype=np.float32)

    face = db_session.query(db_models.Face).filter(
        db_models.Face.user_id == user_id,
        db_models.Face.face_id == face_id
    ).first()

    if face:
        face.name = name
        face.embedding = emb_array              # pgvector handles conversion
        if image_url:
            face.image_url = image_url
        face.created_at = datetime.datetime.utcnow()
    else:
        face = db_models.Face(
            user_id=user_id,
            face_id=face_id,
            name=name,
            embedding=emb_array,                # pgvector handles
            image_url=image_url
        )
        db_session.add(face)
    db_session.commit()
```

**`process_recognize_logic()` (line 616-651) — REWRITE pakai SQL:**

```python
def process_recognize_logic(img, db_session, tenant_user_id, threshold=0.65):
    """
    1:N face identification pakai indexed ANN search di pgvector.
    HNSW index handles nearest neighbor lookup di DB layer.
    """
    start_time = time.time()

    faces = face_app.get(img)
    if len(faces) == 0:
        return {"status": "error", "message": "Face not detected"}

    if len(faces) > 1:
        return {"status": "error", "message": "Multiple faces detected."}

    target_face = faces[0]
    target_emb = target_face.embedding  # 512-d numpy array

    # Convert ke pgvector literal format: '[0.1,0.2,...]'
    emb_literal = '[' + ','.join(f'{x}' for x in target_emb) + ']'

    # Single SQL query - pgvector ANN search
    query = text("""
        SELECT
            face_id,
            name,
            image_url,
            1 - (embedding <=> CAST(:query_emb AS vector)) AS similarity
        FROM faces
        WHERE user_id = :user_id
          AND 1 - (embedding <=> CAST(:query_emb AS vector)) >= :threshold
        ORDER BY embedding <=> CAST(:query_emb AS vector)
        LIMIT 1
    """)

    result = db_session.execute(query, {
        'query_emb': emb_literal,
        'user_id': tenant_user_id,
        'threshold': threshold,
    }).fetchone()

    if result:
        return {
            "status": "success",
            "match": True,
            "take_time": round((time.time() - start_time) * 1000, 2),
            "data": {
                "id": result.face_id,
                "name": result.name,
                "image_url": result.image_url,
                "similarity": float(result.similarity),
            }
        }
    else:
        return {
            "status": "success",
            "match": False,
            "message": "Face not recognized",
        }
```

**`process_recognize_multi()` (line 653-699) — REWRITE:**

```python
def process_recognize_multi(img, db_session, tenant_user_id, threshold=0.65):
    """Multi-face identification pakai batched SQL queries"""
    start_time = time.time()
    faces = face_app.get(img)

    if len(faces) == 0:
        return {"status": "error", "message": "Face not detected"}

    results = []
    for target_face in faces:
        bbox = target_face.bbox.astype(int).tolist()
        landmarks = target_face.kps.astype(int).tolist()
        base_data = {"bbox": bbox, "landmarks": landmarks}

        target_emb = target_face.embedding
        emb_literal = '[' + ','.join(f'{x}' for x in target_emb) + ']'

        query = text("""
            SELECT face_id, name,
                   1 - (embedding <=> CAST(:q AS vector)) AS similarity
            FROM faces
            WHERE user_id = :uid
              AND 1 - (embedding <=> CAST(:q AS vector)) >= :threshold
            ORDER BY embedding <=> CAST(:q AS vector)
            LIMIT 1
        """)

        row = db_session.execute(query, {
            'q': emb_literal,
            'uid': tenant_user_id,
            'threshold': threshold
        }).fetchone()

        if row:
            results.append({
                "match": True,
                "data": {
                    "id": row.face_id,
                    "name": row.name,
                    "similarity": float(row.similarity),
                    **base_data
                }
            })
        else:
            results.append({
                "match": False,
                "message": "Face not recognized",
                "data": base_data
            })

    return {
        "status": "success",
        "mode": "identify_multi",
        "faces": results,
        "take_time": round((time.time() - start_time) * 1000, 2),
    }
```

**6.2. Update controllers di `app/controllers/face_controller.py`:**

```python
# SEBELUM (recognize_endpoint, line 530):
async def recognize_endpoint(file: UploadFile = File(...), current_user: ..., db_session: ...):
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        return {"status": "error", "message": "File size exceeds the 5MB limit"}
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"status": "error", "message": "Invalid or corrupted image"}

    loop = asyncio.get_running_loop()
    tenant_faces = get_tenant_faces(db_session, current_user.id)    # REMOVE
    result = await loop.run_in_executor(
        thread_pool, process_recognize_logic, img, tenant_faces
    )
    return result

# SESUDAH:
async def recognize_endpoint(
    file: UploadFile = File(...),
    current_user: db_models.User = Depends(get_current_user),
    db_session: Session = Depends(db.get_db)
):
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        return {"status": "error", "message": "File size exceeds the 5MB limit"}
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"status": "error", "message": "Invalid or corrupted image"}

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        thread_pool,
        process_recognize_logic,
        img, db_session, current_user.id, 0.65   # threshold default
    )
    return result
```

Sama untuk:
- `recognize_multi_endpoint` (line 555-569)
- `recognize_live_endpoint` (line 505-520)
- `recognize_live_multi_endpoint` (line 580-595)

**6.3. Update `app/services/ml_service_raw.py` (line 111, 122, 725):**

Pattern sama dengan di atas — hapus `json.loads()` dan `json.dumps()`, ganti dengan direct numpy/vector handling.

---

### Fase 7 — Validation & Smoke Test (2-3 jam)

**7.1. Reset environment:**

```bash
docker-compose down -v      # Drop MariaDB volume lama
docker-compose up -d db     # Start Postgres fresh
```

**7.2. Apply migrations:**

```bash
cd backend
alembic upgrade head
```

**7.3. Verify schema:**

```bash
docker exec -it rarayvision-db psql -U raray -d rarayvision
\d faces
# Confirm: embedding | vector(512) | not null

\di ix_faces_user_embedding_hnsw
# Confirm HNSW index exists
```

**7.4. Smoke test endpoints:**

```bash
# Start backend
docker-compose up -d backend

# Test register face
curl -X POST http://localhost:8000/faces \
  -H "Authorization: Bearer <token>" \
  -F "file=@test_face.jpg"

# Test recognize
curl -X POST http://localhost:8000/faces/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@test_face.jpg"
# Should return match=true dengan similarity score

# Test multi-face
curl -X POST http://localhost:8000/faces/recognize/multi \
  -H "Authorization: Bearer <token>" \
  -F "file=@multi_face.jpg"
```

**7.5. Latency check:**

- Expected latency untuk 1000 face: **< 50 ms**
- Cek log backend: ada `take_time` di response

---

## Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Embedding format conversion error | Test dengan sample embedding dulu, validate literal format |
| HNSW index build lambat | Pakai `CONCURRENTLY` jika data besar, untuk fresh OK |
| Docker volume conflict | `docker-compose down -v` di Fase 7, drop volume lama |
| Code import error (Vector) | Validate `pgvector` & `psycopg2` ter-install di container |
| FK constraint issue | Migration order: users → api_keys → faces (parent first) |
| SQLAlchemy version conflict | Cek `SQLAlchemy>=2.0.29` di requirements sudah compatible dengan pgvector |

---

## Performance Expectations

| Scale (faces/tenant) | Old (loop) | New (pgvector + HNSW) | Speedup |
|----------------------|------------|----------------------|---------|
| 100 | ~5 ms | ~5 ms | 1x |
| 1,000 | ~50 ms | ~10-15 ms | ~3-5x |
| 10,000 | ~500 ms | ~20-30 ms | ~15-25x |
| 100,000 | ~5 s (unusable) | ~50-80 ms | ~60-100x |

> **Catatan:** Benchmark dengan data real. HNSW default (`m=16, ef_construction=64`) cukup untuk kebanyakan use case. Tuning hanya kalau latency masih issue setelah data membesar.

---

## Checklist Implementasi

- [ ] **Fase 1** — Update `requirements.txt` & `docker-compose.yml`, buat `init_pgvector.sql`
- [ ] **Fase 2** — Update `config.py` DATABASE_URL ke Postgres
- [ ] **Fase 3** — Init Alembic, edit `env.py` + `alembic.ini`
- [ ] **Fase 4** — Update `models.py`: `Vector(512)` + HNSW index
- [ ] **Fase 5** — Generate migration, tambah manual `CREATE EXTENSION` & HNSW index
- [ ] **Fase 6** — Refactor `ml_service.py` & `ml_service_raw.py` (hapus json, pakai SQL)
- [ ] **Fase 6b** — Update controllers (`recognize_endpoint`, `recognize_multi_endpoint`, dll)
- [ ] **Fase 7** — Smoke test, verify schema, latency check

---

## Workflow Schema Changes ke Depan

Setelah setup Alembic, setiap perubahan schema di masa depan:

```bash
# 1. Edit models.py (misal tambah kolom 'phone' di User)
# 2. Auto-detect perubahan
alembic revision --autogenerate -m "add phone to users"

# 3. Review file di alembic/versions/, edit manual kalau perlu (raw SQL, extension, etc.)

# 4. Apply
alembic upgrade head

# 5. Rollback kalau perlu
alembic downgrade -1
```

---

## Effort Summary

| Fase | Task | Effort |
|------|------|--------|
| 1 | Dependencies & Docker | 3 jam |
| 2 | Config update | 30 menit |
| 3 | Alembic setup | 2-3 jam |
| 4 | Models update | 1 jam |
| 5 | Migration generation | 30 menit |
| 6 | Code refactor | 4-6 jam |
| 7 | Validation | 2-3 jam |
| **Total** | | **~3-4 hari** |

---

## Referensi

- [FACES_RECOGNIZE_ANALYSIS.md](./FACES_RECOGNIZE_ANALYSIS.md) - Overview semua issues
- [FACE_RECOGNIZE_THRESHOLD.md](./FACE_RECOGNIZE_THRESHOLD.md) - Threshold configuration strategy
- [FACE_RECOGNIZE_SEARCH_SCALING.md](./FACE_RECOGNIZE_SEARCH_SCALING.md) - FAISS approach (SUPERSEDED by this plan)
- [pgvector Documentation](https://github.com/pgvector/pgvector) - pgvector official docs
- [Alembic Documentation](https://alembic.sqlalchemy.org/) - Alembic official docs
