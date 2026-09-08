"""Uploads persistence layer.

Real Estate images, invoices, SWIFT proofs, passports, presentations,
videos and every other file written under `/app/uploads/` used to
disappear on every redeploy because the container filesystem is
ephemeral. This module fixes that without requiring endpoint refactors:

- On startup, `restore_uploads_from_storage()` reads a persisted index
  from Object Storage that lists every mirrored `uploads/...` file and
  pulls each one back down to `/app/uploads/`. Immediately after a
  redeploy the container has every file the previous container had.

- Every 60 seconds, `mirror_uploads_to_storage()` walks `/app/uploads/`
  and pushes any file whose size differs from (or is missing in) the
  index. The updated index is then written back to Object Storage. New
  writes done by the running endpoints are picked up on the next tick.

Trade-off: files uploaded within the 60-second mirror gap are lost if
the pod dies before the next tick. Acceptable for this workload.
"""

from __future__ import annotations

import os
import json
import asyncio
import logging

from object_storage import put_object_async, get_object_async, build_path

logger = logging.getLogger(__name__)

UPLOADS_ROOT = "/app/uploads"
STORAGE_PREFIX = "uploads"  # under APP_PREFIX
INDEX_KEY = build_path(STORAGE_PREFIX, ".persist_index.json")

_INDEX: dict[str, int] = {}   # relative_path -> size (bytes)
_INDEX_LOCK = asyncio.Lock()


def _rel(path: str) -> str:
    return os.path.relpath(path, UPLOADS_ROOT).replace(os.sep, "/")


def _key_for(relative_path: str) -> str:
    return build_path(STORAGE_PREFIX, relative_path)


async def _load_index_from_storage() -> dict[str, int]:
    try:
        data, _ct = await get_object_async(INDEX_KEY)
        idx = json.loads(data.decode("utf-8"))
        if isinstance(idx, dict):
            return {str(k): int(v) for k, v in idx.items()}
    except Exception as exc:
        logger.info(f"[uploads_persist] no index found or unreadable: {exc}")
    return {}


async def _save_index_to_storage(index: dict[str, int]) -> None:
    try:
        payload = json.dumps(index, sort_keys=True).encode("utf-8")
        await put_object_async(INDEX_KEY, payload, "application/json")
    except Exception as exc:
        logger.warning(f"[uploads_persist] save index failed: {exc}")


async def restore_uploads_from_storage() -> dict:
    """Rehydrate `/app/uploads/` from Object Storage on boot."""
    global _INDEX
    os.makedirs(UPLOADS_ROOT, exist_ok=True)
    _INDEX = await _load_index_from_storage()
    restored = skipped = errors = 0
    for rel, size in list(_INDEX.items()):
        local = os.path.join(UPLOADS_ROOT, rel)
        try:
            if os.path.exists(local) and os.path.getsize(local) == size:
                skipped += 1
                continue
        except OSError:
            pass
        try:
            data, _ct = await get_object_async(_key_for(rel))
        except Exception as exc:
            logger.debug(f"[uploads_persist] restore {rel}: {exc}")
            errors += 1
            continue
        try:
            os.makedirs(os.path.dirname(local), exist_ok=True)
            with open(local, "wb") as f:
                f.write(data)
            restored += 1
        except Exception as exc:
            logger.warning(f"[uploads_persist] write {rel}: {exc}")
            errors += 1
    logger.info(
        f"[uploads_persist] restore complete — indexed={len(_INDEX)} "
        f"restored={restored} skipped={skipped} errors={errors}"
    )
    return {"indexed": len(_INDEX), "restored": restored, "skipped": skipped, "errors": errors}


async def _push_one(local_path: str) -> bool:
    rel = _rel(local_path)
    try:
        size = os.path.getsize(local_path)
    except OSError:
        return False
    if _INDEX.get(rel) == size:
        return False
    try:
        with open(local_path, "rb") as f:
            content = f.read()
        await put_object_async(_key_for(rel), content, "application/octet-stream")
        _INDEX[rel] = size
        return True
    except Exception as exc:
        logger.debug(f"[uploads_persist] push {rel}: {exc}")
        return False


async def mirror_uploads_to_storage() -> dict:
    """Push any new/changed file under /app/uploads/ up to Object Storage."""
    async with _INDEX_LOCK:
        pushed = skipped = 0
        for root, _dirs, files in os.walk(UPLOADS_ROOT):
            for name in files:
                if name.startswith("."):
                    continue
                path = os.path.join(root, name)
                try:
                    ok = await _push_one(path)
                except Exception:
                    continue
                if ok:
                    pushed += 1
                else:
                    skipped += 1
        if pushed:
            await _save_index_to_storage(_INDEX)
            logger.info(f"[uploads_persist] mirror tick — pushed={pushed} skipped={skipped}")
        return {"pushed": pushed, "skipped": skipped, "indexed": len(_INDEX)}


async def ensure_on_disk(relative_path: str) -> bool:
    """On-demand rehydrate a specific file (helper for download endpoints)."""
    local = os.path.join(UPLOADS_ROOT, relative_path)
    if os.path.exists(local) and os.path.getsize(local) > 0:
        return True
    try:
        data, _ct = await get_object_async(_key_for(relative_path))
    except Exception:
        return False
    try:
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with open(local, "wb") as f:
            f.write(data)
        _INDEX[relative_path] = len(data)
        return True
    except Exception:
        return False
