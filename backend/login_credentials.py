"""
Login_Credentials registry — canonical store for all authenticable entities
that are NOT the primary broker/sub-broker users in `users`.

One document per (login_id, login_type). Plain password + PIN are retained
so a broker can export the list from the Downloads page. The hashed copies
are what auth verifies against.

Login type → source collection → login_id field mapping:
  private_investor_indian  → Private_Investor_Indian_Passport  → pan
  private_investor_foreign → Private_Investor_Foreign_Passport → passport_number
  mfd_ria_partner          → Mfd_Ria_Partner                   → partner_code
  real_estate_partner      → Real_Estate_Partner               → rera_license_number
"""
from datetime import datetime, timezone
from typing import Optional
import re
import uuid

from auth import get_password_hash, verify_password

DEFAULT_PASSWORD = "kinntegraa123"
DEFAULT_PIN = "1234"

LOGIN_TYPE_META = {
    "broker": {
        "collection": "users",
        "login_field": "pan",
        "label": "Broker",
        "priority": 0,  # Lower = higher privilege (refuses to override lower-priv duplicate)
    },
    "private_investor_indian": {
        "collection": "Private_Investor_Indian_Passport",
        "login_field": "pan",
        "label": "Private Investor (Indian)",
        "priority": 5,
    },
    "private_investor_foreign": {
        "collection": "Private_Investor_Foreign_Passport",
        "login_field": "passport_number",
        "label": "Private Investor (Foreign)",
        "priority": 5,
    },
    "mfd_ria_partner": {
        "collection": "Mfd_Ria_Partner",
        "login_field": "partner_code",
        "label": "MFD/RIA Partner",
        "priority": 2,
    },
    "real_estate_partner": {
        "collection": "Real_Estate_Partner",
        "login_field": "rera_license_number",
        "label": "Real Estate Partner",
        "priority": 2,
    },
}


def _normalise(login_id: str) -> str:
    return (login_id or "").strip().upper()


async def ensure_indexes(db) -> None:
    try:
        await db.Login_Credentials.create_index(
            [("login_id", 1), ("login_type", 1)], unique=True
        )
        await db.Login_Credentials.create_index("login_id")
        await db.Login_Credentials.create_index("reference_id")
    except Exception as exc:  # pragma: no cover
        # Index creation is best-effort — unique violation on re-create is fine.
        print(f"[Login_Credentials] index warning: {exc}")


async def upsert_credential(
    db,
    *,
    login_id: str,
    login_type: str,
    reference_id: str,
    name: str = "",
    email: Optional[str] = None,
    plain_password: str = DEFAULT_PASSWORD,
    plain_pin: str = DEFAULT_PIN,
    force_reset: bool = False,
) -> dict:
    """Upsert a credential row. Idempotent — existing rows are left alone
    unless `force_reset=True`, in which case the password + PIN are rewritten
    to the supplied plaintext values."""
    login_id = _normalise(login_id)
    meta = LOGIN_TYPE_META.get(login_type)
    if not meta:
        raise ValueError(f"Unknown login_type={login_type}")
    if not login_id:
        raise ValueError("login_id is required")

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.Login_Credentials.find_one(
        {"login_id": login_id, "login_type": login_type}
    )
    # Cross-type collision guard: if a row with this same login_id already
    # exists under a *different* login_type, refuse to seed a higher-
    # privilege duplicate. This is exactly the scenario that caused
    # client logins to be elevated to broker on production (e.g. a
    # private investor PAN getting an accidental broker `users` row).
    if not existing:
        cross = await db.Login_Credentials.find_one(
            {"login_id": login_id, "login_type": {"$ne": login_type}},
            {"_id": 0, "login_type": 1, "reference_id": 1},
        )
        if cross:
            current_priv = LOGIN_TYPE_META.get(login_type, {}).get("priority", 99)
            existing_priv = LOGIN_TYPE_META.get(cross.get("login_type"), {}).get("priority", 99)
            # Lower number = higher privilege (broker=0, sub_broker=1, ...)
            # Refuse to overwrite a lower-privilege identity with a higher one.
            if current_priv < existing_priv:
                raise ValueError(
                    f"login_id={login_id} is already registered as "
                    f"{cross.get('login_type')} (ref {cross.get('reference_id')}). "
                    f"Refusing to also register it as {login_type} — would "
                    f"elevate the existing user. Resolve the duplicate first."
                )
    if existing and not force_reset:
        # Keep hashes as-is but opportunistically refresh display fields
        # (name / email / reference_id) so the download reflects latest data.
        await db.Login_Credentials.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": name or existing.get("name", ""),
                "email": email if email is not None else existing.get("email"),
                "reference_id": reference_id or existing.get("reference_id"),
                "reference_collection": meta["collection"],
                "updated_at": now,
            }},
        )
        existing.pop("_id", None)
        return existing

    doc = {
        "id": existing.get("id") if existing else str(uuid.uuid4()),
        "login_id": login_id,
        "login_type": login_type,
        "reference_id": reference_id,
        "reference_collection": meta["collection"],
        "name": name or "",
        "email": email or "",
        "password_hash": get_password_hash(plain_password),
        "pin_hash": get_password_hash(plain_pin),
        "plain_password": plain_password,
        "plain_pin": plain_pin,
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
    }
    await db.Login_Credentials.update_one(
        {"login_id": login_id, "login_type": login_type},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def set_plain_password(
    db, *, login_id: str, login_type: str, new_password: str
) -> None:
    """Called when the user self-updates their password. Keeps the admin
    download in sync with the live password."""
    login_id = _normalise(login_id)
    await db.Login_Credentials.update_one(
        {"login_id": login_id, "login_type": login_type},
        {"$set": {
            "password_hash": get_password_hash(new_password),
            "plain_password": new_password,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )


async def set_plain_pin(
    db, *, login_id: str, login_type: str, new_pin: str
) -> None:
    login_id = _normalise(login_id)
    await db.Login_Credentials.update_one(
        {"login_id": login_id, "login_type": login_type},
        {"$set": {
            "pin_hash": get_password_hash(new_pin),
            "plain_pin": new_pin,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )


_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_ALL_DIGITS_RE = re.compile(r"^[0-9]+$")
_BROKER_LOGIN_IDS = {"SUPERUSER", "ADMIN", "BROKER"}


def _infer_login_type_from_id(login_id: str) -> Optional[str]:
    """Classify a login_id by its format alone — each role uses a distinct
    username shape on this platform:

      • Broker             → literal "SUPERUSER" (or other reserved identifiers)
      • MFD/RIA partner    → numeric partner_code (e.g. "1994105")
      • Private Investor   → PAN (5 letters + 4 digits + 1 letter, e.g. "ADCPM6943K")
      • Real Estate / Foreign Investor → fall through (RERA / passport — no
        single regex; resolved by the existing duplicate-aware lookup).
    """
    if not login_id:
        return None
    s = login_id.strip().upper()
    if s in _BROKER_LOGIN_IDS:
        return "broker"
    if _ALL_DIGITS_RE.match(s):
        return "mfd_ria_partner"
    if _PAN_RE.match(s):
        return "private_investor_indian"
    return None


async def find_by_login(db, login_id: str) -> Optional[dict]:
    """Case-insensitive lookup across all login_types.

    Routing: each role has a distinct username format on this platform —
    broker = "SUPERUSER", MFD/RIA = numeric partner_code, private investor =
    PAN. We classify the supplied login_id by its shape and prefer the row
    matching that classification, falling back to the rank-broker-last rule
    so an accidental duplicate row of a different login_type can never
    silently elevate the session.
    """
    norm = _normalise(login_id)
    rows = await db.Login_Credentials.find(
        {"login_id": norm}, {"_id": 0}
    ).to_list(20)
    if not rows:
        return None
    if len(rows) == 1:
        return rows[0]

    # Prefer the row whose login_type matches the inferred format.
    inferred = _infer_login_type_from_id(norm)
    if inferred:
        for row in rows:
            if (row.get("login_type") or "").lower() == inferred:
                return row
    # No format match — fall back to rank-broker-last + most-recently-updated
    # so a duplicate broker row can never auto-win.
    def _rank(row: dict) -> tuple:
        lt = (row.get("login_type") or "").lower()
        is_broker = 1 if lt == "broker" else 0
        upd = row.get("updated_at") or row.get("created_at") or ""
        return (is_broker, -ord(upd[0]) if upd else 0)
    rows.sort(key=_rank)
    return rows[0]


async def verify_login(db, login_id: str, password: str) -> Optional[dict]:
    cred = await find_by_login(db, login_id)
    if not cred:
        return None
    if not verify_password(password, cred.get("password_hash", "")):
        return None
    return cred


async def verify_pin(db, login_id: str, login_type: str, pin: str) -> bool:
    cred = await db.Login_Credentials.find_one(
        {"login_id": _normalise(login_id), "login_type": login_type},
        {"pin_hash": 1, "_id": 0},
    )
    if not cred:
        return False
    return verify_password(pin, cred.get("pin_hash", ""))


async def backfill(db) -> dict:
    """Idempotent seeder — walks all 4 source collections and ensures a
    Login_Credentials row exists for every record. Existing rows are NOT
    overwritten. Returns a per-type count."""
    created = {k: 0 for k in LOGIN_TYPE_META}
    scanned = {k: 0 for k in LOGIN_TYPE_META}

    for login_type, meta in LOGIN_TYPE_META.items():
        coll = db[meta["collection"]]
        cursor = coll.find({}, {"_id": 0})
        async for row in cursor:
            scanned[login_type] += 1
            login_id = row.get(meta["login_field"])
            if not login_id:
                continue
            existing = await db.Login_Credentials.find_one(
                {"login_id": _normalise(login_id), "login_type": login_type}
            )
            if existing:
                continue
            name = (
                row.get("name")
                or row.get("full_name")
                or row.get("client_name")
                or ""
            )
            email = row.get("email")
            await upsert_credential(
                db,
                login_id=login_id,
                login_type=login_type,
                reference_id=row.get("id") or row.get("_id") or "",
                name=name,
                email=email,
            )
            created[login_type] += 1

    return {"created": created, "scanned": scanned}
