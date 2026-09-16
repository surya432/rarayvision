import os
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")), ".env"))

# Database Configuration – default to PostgreSQL 14.7
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Use PostgreSQL by default; allow overriding via env vars
    DB_USER = os.getenv("DB_USER", "raray")
    DB_PASS = os.getenv("DB_PASS", "yourpassword")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "rarayvision")
    # PostgreSQL connection string using psycopg2 driver
    DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Environment mode: "development" (default) or "production"
ENV = os.getenv("ENV", "development").lower()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if ENV == "production":
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    else:
        import warnings
        SECRET_KEY = "dev-only-insecure-secret-key-do-not-use-in-production"
        warnings.warn(
            "WARNING: SECRET_KEY is not set. Using insecure default for development. "
            "Set ENV=production to enforce this.",
            stacklevel=2
        )
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days

# Face recognition similarity threshold (default 0.50)
FACE_RECOGNITION_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.50"))


# Base paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Model paths (inside backend/ml_models/)
ANTI_SPOOF_MODEL_PATH = os.path.join(BASE_DIR, "ml_models", "MiniFASNetV2.onnx")
EMOTION_MODEL_PATH = os.path.join(BASE_DIR, "ml_models", "emotion-ferplus-8.onnx")
