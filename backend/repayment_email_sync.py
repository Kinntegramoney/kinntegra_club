"""
Email → NCD Repayment sync.

Scans two mailboxes for "altGraaf | Returns Initiated" emails, parses each
body, resolves client via Private_Investor_Indian_Passport (falls back to
Foreign_Passport) by email, resolves bond via Ncd_Master.bond_code, and
upserts one document per email into the `Ncd_Repayments` collection.

Incremental: last-seen UID per mailbox is persisted in
`email_sync_state._id == "returns_initiated"` so re-runs only fetch NEW mail.

Idempotent: dedup key `(source_mailbox, source_uid)` — reruns never duplicate.
"""
from __future__ import annotations

import email as email_lib
import imaplib
import os
import re
import uuid
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import Optional

SUBJECT_FILTER = "altGraaf | Returns Initiated"


def _sources() -> list[dict]:
    """Read IMAP source credentials from the environment. Sources with missing
    credentials are silently skipped (e.g. if an env var isn't set yet)."""
    out = []
    if all(os.environ.get(k) for k in ("GMAIL_IMAP_SERVER", "GMAIL_IMAP_PORT", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD")):
        out.append({
            "label": "gmail",
            "host": os.environ["GMAIL_IMAP_SERVER"],
            "port": int(os.environ["GMAIL_IMAP_PORT"]),
            "user": os.environ["GMAIL_ADDRESS"],
            "pw":   os.environ["GMAIL_APP_PASSWORD"],
            "folder": '"INBOX/AMC/Altgraaf/Returns Initiated"',
        })
    if all(os.environ.get(k) for k in ("EMAIL_IMAP_SERVER", "EMAIL_IMAP_PORT", "EMAIL_ADDRESS", "EMAIL_PASSWORD")):
        out.append({
            "label": "webmail",
            "host": os.environ["EMAIL_IMAP_SERVER"],
            "port": int(os.environ["EMAIL_IMAP_PORT"]),
            "user": os.environ["EMAIL_ADDRESS"],
            "pw":   os.environ["EMAIL_PASSWORD"],
            "folder": "INBOX.Altgraaf.Repayments",
        })
    return out


def _decode(h) -> str:
    if not h:
        return ""
    return "".join(
        str(p) if isinstance(p, str) else p.decode(c or "utf-8", "replace")
        for p, c in decode_header(h)
    )


def _strip_html(html: str) -> str:
    html = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", html)
    html = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    txt = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", txt).strip()


def _body_text(msg) -> str:
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            payload = part.get_payload(decode=True)
            if payload:
                return _strip_html(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
    for part in msg.walk():
        if part.get_content_type() == "text/plain":
            payload = part.get_payload(decode=True)
            if payload:
                return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    return ""


def _to_amount(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    s = s.replace(",", "").replace("₹", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_returns_initiated(msg) -> Optional[dict]:
    """Extract fields from a 'Returns Initiated' email. Returns None if this
    isn't a Returns Initiated message."""
    subject = _decode(msg["Subject"]) or ""
    if SUBJECT_FILTER not in subject:
        return None

    to_header = _decode(msg["To"]) or ""
    to_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", to_header)
    to_email = to_match.group(0).lower() if to_match else ""

    issuer_match = re.search(r"Returns Initiated\s*-\s*(.+?)\s*$", subject, re.I)
    issuer_from_subject = (issuer_match.group(1).strip() if issuer_match else "").title()

    received_dt = None
    if msg["Date"]:
        try:
            received_dt = parsedate_to_datetime(msg["Date"]).astimezone(timezone.utc)
        except Exception:
            received_dt = None

    body = _body_text(msg)

    def grab(pattern: str, default=None):
        m = re.search(pattern, body, re.I)
        return m.group(1).strip() if m else default

    bond_code = grab(r"Opportunity ID\s+([A-Z0-9]+)")
    date_str  = grab(r"Repayment Date\s+([A-Za-z]+\s+\d+\s+\d{4})")
    gross     = _to_amount(grab(r"Total Gross Amount Repaid\s*₹\s*([\d.,]+)"))
    principal = _to_amount(grab(r"Principal\s*₹\s*([\d.,]+)"))
    interest  = _to_amount(grab(r"Interest\s*₹\s*([\d.,]+)"))
    net       = _to_amount(grab(r"Net Amount Repaid[^₹]*₹\s*([\d.,]+)"))
    name_body = grab(r"Dear\s+([^,]+),")

    repayment_date = None
    if date_str:
        try:
            repayment_date = datetime.strptime(date_str, "%b %d %Y").strftime("%Y-%m-%d")
        except ValueError:
            repayment_date = None

    tds = round(gross - net, 2) if (gross is not None and net is not None) else None

    return {
        "subject": subject,
        "issuer_name_from_subject": issuer_from_subject,
        "email_received_date": received_dt.isoformat() if received_dt else None,
        "client_email": to_email,
        "client_name_in_body": (name_body or "").strip(),
        "opportunity_id": bond_code,
        "bond_code": bond_code,
        "repayment_date": repayment_date,
        "gross_amount": gross,
        "principal": principal,
        "interest": interest,
        "net_amount": net,
        "tds": tds,
    }


async def sync_from_email(db, user: Optional[dict] = None) -> dict:
    """Main entry point. Scan every configured mailbox incrementally and
    upsert one row per email into `Ncd_Repayments`. Returns a sync report."""
    report = {
        "sources":              [],
        "new_rows":             0,
        "updated_rows":         0,
        "unknown_client_email": 0,
        "unknown_bond_code":    0,
        "parse_failures":       0,
        "errors":               [],
    }

    state_row = await db.email_sync_state.find_one({"_id": "returns_initiated"}) or {}
    new_state = dict(state_row)

    sources = _sources()
    for src in sources:
        per = {"label": src["label"], "scanned": 0, "processed": 0, "start_uid": 0, "end_uid": 0}
        try:
            last_uid = int(state_row.get(src["label"], 0))
            per["start_uid"] = last_uid

            m = imaplib.IMAP4_SSL(src["host"], src["port"])
            m.login(src["user"], src["pw"])
            r, _ = m.select(src["folder"], readonly=True)
            if r != "OK":
                raise RuntimeError(f"cannot select folder {src['folder']!r}")

            search_uid = f"{last_uid + 1}:*" if last_uid else "1:*"
            typ, data = m.uid("SEARCH", None, f"UID {search_uid}")
            ids = data[0].split() if data and data[0] else []
            # IMAP quirk: `N:*` returns the last UID even if strictly > N is empty
            ids = [b for b in ids if int(b) > last_uid]
            per["scanned"] = len(ids)

            max_uid = last_uid
            for uid_b in ids:
                uid = int(uid_b)
                try:
                    typ, md = m.uid("FETCH", uid_b, "(RFC822)")
                    msg_obj = None
                    for x in md:
                        if isinstance(x, tuple):
                            msg_obj = email_lib.message_from_bytes(x[1])
                            break
                    if not msg_obj:
                        continue

                    parsed = parse_returns_initiated(msg_obj)
                    if not parsed:
                        # Not a Returns Initiated email — still advance the cursor
                        if uid > max_uid: max_uid = uid
                        continue

                    # Validate minimally
                    if not (parsed["bond_code"] and parsed["repayment_date"] and parsed["gross_amount"] is not None):
                        report["parse_failures"] += 1
                        if uid > max_uid: max_uid = uid
                        continue

                    # Resolve bond FIRST — if the bond_code doesn't exist in
                    # Ncd_Master we drop this email entirely (per your rule:
                    # only import rows whose bond_code is reflected in the
                    # master). Advance the UID cursor so we don't keep
                    # re-fetching the same skipped email.
                    bond = await db.Ncd_Master.find_one({"bond_code": parsed["bond_code"]}, {"_id": 0})
                    if not bond:
                        report["unknown_bond_code"] += 1
                        if uid > max_uid: max_uid = uid
                        continue

                    # Resolve client — body-name-first, then email fallback.
                    # The bond's "Returns Initiated" email is sent to the
                    # mailbox owner (often the head of family) but the body
                    # names the actual beneficiary in
                    # `client_name_in_body`. We prefer that as the source
                    # of truth so family-member rows attribute correctly
                    # from day one. Falls back to email-based lookup only
                    # when no investor exactly matches the body name.
                    inv = None
                    body_name = (parsed.get("client_name_in_body") or "").strip()
                    if body_name:
                        # Lenient normalisation: lowercase, drop non-
                        # alphanumeric (so "(HUF)", "(huf)", "HUF" all map
                        # to the same key).
                        norm_target = "".join(
                            ch for ch in body_name.lower() if ch.isalnum() or ch.isspace()
                        )
                        norm_target = " ".join(norm_target.split())
                        for coll in (
                            "Private_Investor_Indian_Passport",
                            "Private_Investor_Foreign_Passport",
                            "Private_Investor",
                        ):
                            async for cand in db[coll].find({}, {"_id": 0, "id": 1, "name": 1, "pan_number": 1, "passport_type": 1}):
                                cand_name = (cand.get("name") or "").strip()
                                if not cand_name:
                                    continue
                                norm_cand = "".join(
                                    ch for ch in cand_name.lower() if ch.isalnum() or ch.isspace()
                                )
                                norm_cand = " ".join(norm_cand.split())
                                if norm_cand == norm_target:
                                    inv = cand
                                    break
                            if inv:
                                break
                    if not inv:
                        inv = await db.Private_Investor_Indian_Passport.find_one(
                            {"email": {"$regex": f"^{re.escape(parsed['client_email'])}$", "$options": "i"}},
                            {"_id": 0},
                        )
                    if not inv:
                        inv = await db.Private_Investor_Foreign_Passport.find_one(
                            {"email": {"$regex": f"^{re.escape(parsed['client_email'])}$", "$options": "i"}},
                            {"_id": 0},
                        )

                    if inv:
                        status = "resolved"
                    else:
                        status = "unknown_client"
                        report["unknown_client_email"] += 1

                    # Upsert (dedup by source_mailbox + source_uid)
                    now = datetime.now(timezone.utc).isoformat()
                    set_fields = {
                        "email_received_date":      parsed["email_received_date"],
                        "repayment_date":           parsed["repayment_date"],
                        "client_email":             parsed["client_email"],
                        "client_name":              (inv or {}).get("name") or parsed["client_name_in_body"],
                        "client_name_in_body":      parsed["client_name_in_body"],
                        "client_pan":               (inv or {}).get("pan_number") or "",
                        "client_id":                (inv or {}).get("id"),
                        "passport_type":            (inv or {}).get("passport_type"),
                        "opportunity_id":           parsed["opportunity_id"],
                        "bond_code":                parsed["bond_code"],
                        "bond_id":                  (bond or {}).get("id"),
                        "bond_name":                (bond or {}).get("name") or parsed["issuer_name_from_subject"],
                        "issuer_name_from_subject": parsed["issuer_name_from_subject"],
                        "gross_amount":             parsed["gross_amount"],
                        "principal":                parsed["principal"],
                        "interest":                 parsed["interest"],
                        "net_amount":               parsed["net_amount"],
                        "tds":                      parsed["tds"],
                        "email_subject":            parsed["subject"],
                        "resolution_status":        status,
                        "updated_at":               now,
                    }
                    res = await db.Ncd_Repayments.update_one(
                        {"source_mailbox": src["label"], "source_uid": uid},
                        {
                            "$set": set_fields,
                            "$setOnInsert": {
                                "id":              str(uuid.uuid4()),
                                "source_mailbox":  src["label"],
                                "source_uid":      uid,
                                "source_folder":   src["folder"],
                                "created_at":      now,
                                "created_by":      (user or {}).get("id"),
                            },
                        },
                        upsert=True,
                    )
                    if res.upserted_id is not None:
                        report["new_rows"] += 1
                    elif res.modified_count:
                        report["updated_rows"] += 1
                    per["processed"] += 1
                    if uid > max_uid: max_uid = uid
                except Exception as e:
                    report["errors"].append(f"{src['label']} UID {uid}: {type(e).__name__}: {e}")
                    if uid > max_uid: max_uid = uid

            per["end_uid"] = max_uid
            new_state[src["label"]] = max_uid
            m.logout()
        except Exception as e:
            report["errors"].append(f"{src['label']}: {type(e).__name__}: {e}")
        report["sources"].append(per)

    new_state["_id"] = "returns_initiated"
    new_state["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.email_sync_state.replace_one({"_id": "returns_initiated"}, new_state, upsert=True)
    return report
