"""
Config — v2 White-Label Edition
Removed: Firebase, Cashfree, PayPal, SendGrid, IMAP
Added:   LICENSE_KEY, LICENSE_SERVER_URL, ENCRYPTION_KEY
"""
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME:    str = "AI Call Center"
    APP_VERSION: str = "2.0.0"
    DEBUG:       bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./callcenter.db"

    # Auth
    JWT_SECRET_KEY: str = "change-this-to-a-long-random-secret-in-production"
    JWT_ALGORITHM:  str = "HS256"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://ancentrixvoice-five.vercel.app"
    ]

    # License
    LICENSE_KEY:        str = ""
    LICENSE_SERVER_URL: str = "https://license.yourdomain.com"
    DEPLOYMENT_DOMAIN:  str = "localhost"   # set to client's domain in production

    # Encryption key for API keys stored in DB (32-char hex)
    ENCRYPTION_KEY: str = "changeme32charslongencryptionkey"

    # Telnyx — defaults, overridden per-company from DB
    TELNYX_API_KEY:        str = ""
    TELNYX_PHONE_NUMBER:   str = ""
    TELNYX_CONNECTION_ID:  str = ""
    TELNYX_WEBHOOK_BASE_URL: str = ""

    # Deepgram
    DEEPGRAM_API_KEY: str = ""

    # LLM
    LLM_PROVIDER: str = "groq"
    GROQ_API_KEY:  str = ""
    GROQ_MODEL:    str = "llama-3.3-70b-versatile"
    OPENAI_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Storage
    UPLOAD_DIR:         str = "./uploads"
    CHROMADB_LOCAL_PATH: str = "./chroma_data"
    EMBEDDING_MODEL:    str = "sentence-transformers/all-MiniLM-L6-v2"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
