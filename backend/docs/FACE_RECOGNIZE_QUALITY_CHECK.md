# Face Quality Check - Design (Poin #5)

**Topik:** Hybrid quality assessment untuk register & recognize paths
**Referensi issue:** [FACES_RECOGNIZE_ANALYSIS.md - Poin #5](./FACES_RECOGNIZE_ANALYSIS.md#5-no-face-quality-assessment-accuracy---medium)
**Related:** [FACE_RECOGNIZE_PGVECTOR_MIGRATION.md](./FACE_RECOGNIZE_PGVECTOR_MIGRATION.md)

---

## Context

Pipeline saat ini tidak ada quality assessment. Foto blur, gelap, atau pose ekstrem tetap diproses → embedding kurang akurat → recognition error-prone.

`check_liveness()` di `ml_service.py:218-242` sudah pakai Laplacian sharpness untuk tujuan anti-spoofing, tapi **tidak expose ke caller sebagai quality metric**.

## Keputusan Final

| Aspek | Keputusan |
|-------|-----------|
| Pendekatan | **Hybrid: gate (hard reject) + score (metadata)** |
| Path | **Both** (register + recognize) |
| Threshold behavior | **No adjustment** — quality sebagai info saja |
| Threshold configurability | **Env-configurable** untuk tuning |
| Quality di response | **Always return** |

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│              Image Input (Register / Recognize)        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │   Layer 1: Gate      │  ← Hard reject kalau unusable
                └──────────┬───────────┘
                           │ (passes)
                           ▼
                ┌──────────────────────┐
                │  Layer 2: Score      │  ← Return quality metadata
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Recognition /       │
                │  Registration        │
                └──────────────────────┘
```

## 4 Metrics

| Metric | Cara Hitung | Gate Threshold | Score (0-1) |
|--------|-------------|----------------|-------------|
| **Sharpness/Blur** | `cv2.Laplacian(gray).var()` | `< 50` reject | `min(lap_var / 200, 1.0)` |
| **Brightness** | `LAB[:,:,0].mean()` | `< 30` atau `> 220` reject | Distance dari optimal range (80-180) |
| **Pose** | Nose offset dari eye midpoint | `> 0.4` reject | `max(0, 1 - nose_offset * 3)` |
| **Face Size** | `min(bbox_w, bbox_h)` | `< 80px` reject | `min(min_dim / 112, 1.0)` |

### Weighted Quality Score

```python
quality_weights = {
    'sharpness': 0.30,
    'brightness': 0.20,
    'pose': 0.30,
    'size': 0.20
}

quality_score = (
    sharpness_score * 0.30 +
    brightness_score * 0.20 +
    pose_score * 0.30 +
    size_score * 0.20
)

# Label
if quality_score >= 0.7:   label = "good"
elif quality_score >= 0.4: label = "fair"
else:                       label = "poor"
```

---

## Config (app/core/config.py)

```python
# Face Quality Thresholds (env-configurable)
QUALITY_MIN_FACE_SIZE = int(os.getenv("QUALITY_MIN_FACE_SIZE", "80"))
QUALITY_MIN_SHARPNESS = float(os.getenv("QUALITY_MIN_SHARPNESS", "50.0"))
QUALITY_BRIGHTNESS_MIN = int(os.getenv("QUALITY_BRIGHTNESS_MIN", "40"))
QUALITY_BRIGHTNESS_MAX = int(os.getenv("QUALITY_BRIGHTNESS_MAX", "200"))
QUALITY_BRIGHTNESS_HARD_MIN = int(os.getenv("QUALITY_BRIGHTNESS_HARD_MIN", "30"))
QUALITY_BRIGHTNESS_HARD_MAX = int(os.getenv("QUALITY_BRIGHTNESS_HARD_MAX", "220"))
QUALITY_MAX_POSE_OFFSET = float(os.getenv("QUALITY_MAX_POSE_OFFSET", "0.4"))
```

---

## `assess_face_quality()` Function

```python
def assess_face_quality(img, bbox, landmarks=None):
    """
    Returns:
    {
        "passes_gate": bool,
        "reasons": list[str],
        "scores": {
            "overall": float (0-1),
            "label": "good" | "fair" | "poor",
            "sharpness": float,
            "brightness": float,
            "pose": float,
            "size": float
        }
    }
    """
    from app.core.config import (
        QUALITY_MIN_FACE_SIZE, QUALITY_MIN_SHARPNESS,
        QUALITY_BRIGHTNESS_HARD_MIN, QUALITY_BRIGHTNESS_HARD_MAX,
        QUALITY_MAX_POSE_OFFSET
    )

    x1, y1, x2, y2 = bbox.astype(int)
    face_roi = img[y1:y2, x1:x2]

    if face_roi.size == 0:
        return {
            "passes_gate": False,
            "reasons": ["invalid_face_roi"],
            "scores": {}
        }

    # --- Face Size ---
    bbox_w, bbox_h = x2 - x1, y2 - y1
    min_dim = min(bbox_w, bbox_h)
    size_score = min(min_dim / 112.0, 1.0)

    # --- Sharpness (Laplacian variance) ---
    gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness_score = min(lap_var / 200.0, 1.0)

    # --- Brightness (LAB L channel) ---
    lab = cv2.cvtColor(face_roi, cv2.COLOR_BGR2LAB)
    mean_l = float(lab[:, :, 0].mean())

    if mean_l < QUALITY_BRIGHTNESS_HARD_MIN or mean_l > QUALITY_BRIGHTNESS_HARD_MAX:
        brightness_score = 0.0
    elif 80 <= mean_l <= 180:
        brightness_score = 1.0
    else:
        distance_from_optimal = min(abs(mean_l - 80), abs(mean_l - 180))
        brightness_score = max(0, 1 - (distance_from_optimal / 40))

    # --- Pose (nose offset heuristic) ---
    pose_score = 1.0
    if landmarks is not None and len(landmarks) >= 3:
        left_eye = landmarks[0]
        right_eye = landmarks[1]
        nose = landmarks[2]
        eye_mid_x = (left_eye[0] + right_eye[0]) / 2
        eye_dist = abs(right_eye[0] - left_eye[0])
        if eye_dist > 0:
            nose_offset = abs(nose[0] - eye_mid_x) / eye_dist
            pose_score = max(0, 1 - nose_offset * 3)

    # --- Overall Score ---
    quality_score = (
        sharpness_score * 0.30 +
        brightness_score * 0.20 +
        pose_score * 0.30 +
        size_score * 0.20
    )

    if quality_score >= 0.7:
        label = "good"
    elif quality_score >= 0.4:
        label = "fair"
    else:
        label = "poor"

    # --- Gate Check ---
    reasons = []
    if min_dim < QUALITY_MIN_FACE_SIZE:
        reasons.append("face_too_small")
    if lap_var < QUALITY_MIN_SHARPNESS:
        reasons.append("too_blurry")
    if mean_l < QUALITY_BRIGHTNESS_HARD_MIN or mean_l > QUALITY_BRIGHTNESS_HARD_MAX:
        reasons.append("lighting_issue")
    if landmarks is not None and pose_score < (1 - QUALITY_MAX_POSE_OFFSET):
        reasons.append("extreme_pose")

    return {
        "passes_gate": len(reasons) == 0,
        "reasons": reasons,
        "scores": {
            "overall": round(quality_score, 3),
            "label": label,
            "sharpness": round(sharpness_score, 3),
            "brightness": round(brightness_score, 3),
            "pose": round(pose_score, 3),
            "size": round(size_score, 3)
        }
    }
```

---

## Response Format

**Success (pass gate):**
```json
{
    "status": "success",
    "match": true,
    "data": {
        "id": "user_123",
        "name": "John Doe",
        "similarity": 0.82
    },
    "quality": {
        "overall": 0.82,
        "label": "good",
        "sharpness": 0.85,
        "brightness": 0.90,
        "pose": 0.75,
        "size": 0.80
    }
}
```

**Gate rejection:**
```json
{
    "status": "error",
    "message": "Face image quality too low",
    "reasons": ["too_blurry", "face_too_small"],
    "quality": {
        "overall": 0.18,
        "label": "poor",
        "sharpness": 0.12,
        "brightness": 0.25,
        "pose": 0.30,
        "size": 0.15
    }
}
```

---

## Integrasi

### Register Path

**`process_register_live()` dan `process_register_logic()` di `ml_service.py`:**
```python
def process_register_live(img, check_spoof=True):
    faces = face_app.get(img)
    # ... existing face detection ...

    face = faces[0]

    # NEW: Quality check (gate)
    quality = assess_face_quality(img, face.bbox, face.kps)
    if not quality["passes_gate"]:
        return {
            "status": "error",
            "message": f"Face quality too low: {', '.join(quality['reasons'])}",
            "quality": quality["scores"]
        }

    # ... continue with liveness + embedding extraction ...

    return {
        "status": "success",
        "embedding": face.embedding.tolist(),
        "liveness_score": score,
        "quality": quality["scores"]
    }
```

### Recognize Path

**`process_recognize_logic()` di `ml_service.py`:**
```python
def process_recognize_logic(img, db_session, tenant_user_id, threshold=0.65):
    faces = face_app.get(img)
    if len(faces) == 0:
        return {"status": "error", "message": "Face not detected"}
    if len(faces) > 1:
        return {"status": "error", "message": "Multiple faces detected"}

    target_face = faces[0]

    # NEW: Quality check (gate + score)
    quality = assess_face_quality(img, target_face.bbox, target_face.kps)
    if not quality["passes_gate"]:
        return {
            "status": "error",
            "message": f"Face quality too low: {', '.join(quality['reasons'])}",
            "quality": quality["scores"]
        }

    # ... existing pgvector recognition logic ...

    return {
        "status": "success",
        "match": True,
        "data": {...},
        "quality": quality["scores"]  # Always return
    }
```

---

## File Changes

| File | Perubahan |
|------|-----------|
| `app/core/config.py` | Tambah env vars untuk quality thresholds |
| `app/services/ml_service.py` | Tambah `assess_face_quality()`, integrate ke register & recognize functions |
| `app/services/ml_service_raw.py` | Mirror same change |
| `app/controllers/face_controller.py` | (No change — pass-through) |

---

## Behavioral Rules

| Path | Gate Failure | Score in Response |
|------|--------------|-------------------|
| **Register** | **Reject** (return error) | Always return |
| **Recognize** | **Reject** (return error) | Always return |

---

## Threshold Tuning Strategy

**Initial values** di proposal ini adalah starting point. Tuning berdasarkan:
1. Collect real-world data + manual labeling
2. Adjust thresholds via env vars (no code change needed)
3. Monitor false reject rate vs false accept rate

**Rekomendasi:** Collect minimal 100 sample (good + bad quality) untuk calibrate threshold awal.

---

## Effort

| Task | Effort |
|------|--------|
| `assess_face_quality()` function | 2 jam |
| Integration ke register endpoints | 1 jam |
| Integration ke recognize endpoints | 1 jam |
| Mirror ke `ml_service_raw.py` | 1 jam |
| Response schema validation | 30 menit |
| Testing & tuning | 1 jam |
| **Total** | **~6 jam** |

---

## Status

- [x] Diskusi selesai - hybrid gate + score, both paths, env-configurable
- [ ] Implementasi `assess_face_quality()` di `ml_service.py`
- [ ] Mirror ke `ml_service_raw.py`
- [ ] Integration ke register functions
- [ ] Integration ke recognize functions
- [ ] Tuning thresholds dengan sample data

---

## Catatan Tambahan

- **Pose estimation kasar** — 5-point landmarks heuristic, bukan 3D pose estimation. Untuk akurasi tinggi butuh model tambahan atau 68-point landmarks.
- **Score tidak affect threshold recognition** — Keputusan eksplisit: quality sebagai info, threshold tetap default. Caller (frontend/logic) yang decide.
- **Threshold hardcoded 0.5** untuk beberapa cek internal (pose_score < 0.5 → reject). Bisa di-expose ke env kalau perlu tuning.
