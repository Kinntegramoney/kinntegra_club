"""
Thin wrapper around Emergent's object storage REST API.

Replaces all `open('/app/uploads/..', 'wb').write(bytes)` + `FileResponse(path)`
patterns in server.py. Files now live in persistent object storage and survive
pod restarts. MongoDB remains the source of truth for metadata (with a new
`is_deleted` flag since the storage API has no delete).

Usage:
    from object_storage import put_object, get_object, ensure_started

    await ensure_started()  # idempotent

    res = put_object("bond_platform/bonds/<bond_id>/presentations/<uuid>.pdf", data, "application/pdf")
    # -> {"path": "...", "size": 12345, "etag": "..."}

    bytes_, ctype = get_object(res["path"])
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Tuple

import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_PREFIX = "bond_platform"  # all paths are namespaced under this prefix

_storage_key: str | None = None
_init_lock = asyncio.Lock()


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY is not set in backend/.env")
    return key


def _init_sync() -> str:
    """Fetch and cache the session storage key. Safe to call repeatedly."""
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": _emergent_key()},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("[object_storage] initialised ok")
    return _storage_key


async def ensure_started() -> str:
    """Async-safe one-time init. Call from FastAPI startup and/or first use."""
    global _storage_key
    if _storage_key:
        return _storage_key
    async with _init_lock:
        if _storage_key:
            return _storage_key
        return await asyncio.to_thread(_init_sync)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Synchronously upload a file. Prefer `put_object_async` from async paths."""
    key = _init_sync()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type or "application/octet-stream"},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    """Synchronously download. Returns (bytes, content_type)."""
    key = _init_sync()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def put_object_async(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(put_object, path, data, content_type)


async def get_object_async(path: str) -> Tuple[bytes, str]:
    return await asyncio.to_thread(get_object, path)


def build_path(*parts: str) -> str:
    """Join path parts under the app prefix. No leading slashes."""
    clean = [p.strip("/") for p in parts if p]
    return "/".join([APP_PREFIX, *clean])
