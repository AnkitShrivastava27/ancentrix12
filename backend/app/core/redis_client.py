"""
Shared in-memory session store.
Works correctly within a single uvicorn process.
Use Redis in production for multi-worker/multi-server setups.
"""
import json
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# Module-level shared store — persists across all requests in same process
_store: dict = {}


class RedisClient:
    async def set(self, key: str, value: Any, expire: int = 3600):
        _store[key] = json.dumps(value) if not isinstance(value, str) else value

    async def get(self, key: str) -> Optional[Any]:
        val = _store.get(key)
        if val is None:
            return None
        try:
            return json.loads(val)
        except Exception:
            return val

    async def delete(self, key: str):
        _store.pop(key, None)

    async def exists(self, key: str) -> bool:
        return key in _store

    async def set_with_check(self, key: str, value: Any, expire: int = 3600) -> bool:
        self.set(key, value, expire)
        return True


redis_client = RedisClient()
