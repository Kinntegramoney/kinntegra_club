"""
NAV Master Sync Service
=======================

Fetches Mutual-Fund NAV data from AMFI and stores it in MongoDB `nav_master`.

Data sources
------------
1. Daily / current NAV:
   https://portal.amfiindia.com/spages/NAVAll.txt
2. Historical NAV (any single date):
   http://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx
   query params: mf=0 (all AMCs) , tp=0 (all types) ,
                 frmdt=DD-MMM-YYYY , todt=DD-MMM-YYYY

The 3-year / 5-year NAVs are fetched by setting `frmdt == todt == today - N years`.

Collection schema: `nav_master`
    {
      scheme_code: "119551",       # primary key (string)
      scheme_name: "Axis Bluechip Fund Direct Plan - Growth",
      isin_growth: "INF...",
      isin_div: "INF...",
      amc_name: "AXIS ASSET MANAGEMENT COMPANY LIMITED",
      scheme_category: "Open Ended",
      scheme_type: "Growth" | "IDCW" | "Other",

      nav_current:  {value: 45.1234, date: "2026-04-21"},
      nav_3y:       {value: 32.5000, date: "2023-04-21"},
      nav_5y:       {value: 28.1100, date: "2021-04-21"},

      updated_at: ISO timestamp
    }
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from dateutil.relativedelta import relativedelta
from pymongo import UpdateOne

logger = logging.getLogger(__name__)

AMFI_DAILY_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
AMFI_HISTORY_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"

# AMFI sometimes refuses non-browser User-Agents. Use a realistic header.
_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/plain,text/csv,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Keywords in a row to detect scheme type
_GROWTH_KEYS = ("growth", "gr ")
_IDCW_KEYS = ("idcw", "dividend", "div ")


# -----------------------------------------------------------------------------
# Parsing
# -----------------------------------------------------------------------------
def _parse_amfi_nav_text(text: str) -> List[Dict]:
    """
    Parse AMFI NAV text (semicolon-delimited) from either:

    * Daily snapshot (NAVAll.txt) — header:
        Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;
        Scheme Name;Net Asset Value;Repurchase Price;Sale Price;Date

    * Historical single-date dump (DownloadNAVHistoryReport_Po.aspx?mf=3…) —
      header has `Scheme Name` and the two ISIN cols swapped:
        Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;
        ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date

    The column order is detected from the header row once; the rest of the
    file uses that mapping. Category/AMC banner lines are tracked so every
    scheme row carries its AMC + category.
    """
    rows: List[Dict] = []
    current_amc: str = ""
    current_category: str = ""
    col_idx: Dict[str, int] = {}

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if ";" not in line:
            # Non-data line: either category header or AMC name.
            if "scheme" in line.lower() and line.endswith(")"):
                current_category = line
            else:
                current_amc = line
            continue

        parts = [p.strip() for p in line.split(";")]

        # First non-blank semicolon line with "Scheme Code" is the header.
        if not col_idx:
            header_lower = [p.lower() for p in parts]
            if "scheme code" in header_lower:
                for i, h in enumerate(header_lower):
                    if h == "scheme code":
                        col_idx["scheme_code"] = i
                    elif h == "scheme name":
                        col_idx["scheme_name"] = i
                    elif h.startswith("isin div payout") or h == "isin growth":
                        col_idx["isin_growth"] = i
                    elif h.startswith("isin div reinvestment"):
                        col_idx["isin_div"] = i
                    elif h == "net asset value":
                        col_idx["nav"] = i
                    elif h == "date":
                        col_idx["date"] = i
                continue  # don't treat header row as data

        if not col_idx:
            # Fall back to the canonical daily-file layout if header wasn't
            # found (shouldn't happen, but avoids crashing).
            col_idx = {"scheme_code": 0, "isin_growth": 1, "isin_div": 2,
                       "scheme_name": 3, "nav": 4, "date": len(parts) - 1}

        if len(parts) <= max(col_idx.values()):
            continue

        scheme_code_str = parts[col_idx["scheme_code"]]
        if not scheme_code_str.isdigit():
            continue

        scheme_name = parts[col_idx["scheme_name"]] if "scheme_name" in col_idx else ""
        isin_growth = parts[col_idx["isin_growth"]] if "isin_growth" in col_idx else ""
        isin_div = parts[col_idx["isin_div"]] if "isin_div" in col_idx else ""
        nav_raw = parts[col_idx["nav"]] if "nav" in col_idx else ""
        date_raw = parts[col_idx["date"]] if "date" in col_idx else parts[-1]

        try:
            nav_value = float(nav_raw)
        except (TypeError, ValueError):
            continue

        nav_date_iso: Optional[str] = None
        try:
            nav_date_iso = datetime.strptime(date_raw, "%d-%b-%Y").date().isoformat()
        except ValueError:
            nav_date_iso = None

        lname = scheme_name.lower()
        if any(k in lname for k in _GROWTH_KEYS):
            scheme_type = "Growth"
        elif any(k in lname for k in _IDCW_KEYS):
            scheme_type = "IDCW"
        else:
            scheme_type = "Other"

        rows.append(
            {
                "scheme_code": scheme_code_str,
                "scheme_name": scheme_name,
                "isin_growth": isin_growth or None,
                "isin_div": isin_div or None,
                "amc_name": current_amc or None,
                "scheme_category": current_category or None,
                "scheme_type": scheme_type,
                "nav_value": nav_value,
                "nav_date": nav_date_iso,
            }
        )

    return rows


# -----------------------------------------------------------------------------
# Network
# -----------------------------------------------------------------------------
def _http_get_text(url: str, params: Optional[Dict] = None, timeout: int = 60) -> str:
    resp = requests.get(url, params=params, headers=_HTTP_HEADERS, timeout=timeout)
    resp.raise_for_status()
    # AMFI serves as text/plain
    return resp.text


def fetch_daily_nav_rows() -> List[Dict]:
    """Fetch the latest (daily) NAV snapshot from AMFI."""
    logger.info("NAV Master: fetching daily NAVAll.txt ...")
    text = _http_get_text(AMFI_DAILY_URL)
    rows = _parse_amfi_nav_text(text)
    logger.info("NAV Master: parsed %d daily NAV rows", len(rows))
    return rows


def fetch_historical_nav_rows(target: date) -> List[Dict]:
    """
    Fetch NAVs for a single historical date.

    Uses AMFI's "Download NAV History Report" backend with `mf=3` (All
    schemes). Date format is DD-MMM-YYYY; passing `frmdt == todt` yields the
    single-day snapshot.
    """
    dmy = target.strftime("%d-%b-%Y")
    # Empty `mf` = All mutual funds, empty `tp` = All scheme types (Open/Close/Interval).
    # (AMFI's form submits these fields blank when the user picks "All".)
    params = {"mf": "", "tp": "", "frmdt": dmy, "todt": dmy}
    logger.info("NAV Master: fetching historical NAVs for %s ...", dmy)
    text = _http_get_text(AMFI_HISTORY_URL, params=params)
    rows = _parse_amfi_nav_text(text)
    logger.info("NAV Master: parsed %d historical NAV rows for %s", len(rows), dmy)
    return rows


# -----------------------------------------------------------------------------
# Persistence
# -----------------------------------------------------------------------------
def _ensure_indexes(db) -> None:
    """Create indexes on first run (idempotent)."""
    try:
        db.nav_master.create_index("scheme_code", unique=True)
        db.nav_master.create_index("isin_growth")
        db.nav_master.create_index("isin_div")
        # History collection: append-only per (scheme_code, nav_date).
        db.nav_master_history.create_index(
            [("scheme_code", 1), ("nav_date", 1)], unique=True,
        )
        db.nav_master_history.create_index("nav_date")
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("NAV Master: index creation warning: %s", exc)


def _bulk_append_history(db, rows: Iterable[Dict]) -> int:
    """
    Append one per-day NAV record into the history collection. Idempotent:
    re-ingesting the same (scheme_code, nav_date) updates the same doc so
    we never lose older days' data.
    """
    ops: List[UpdateOne] = []
    for r in rows:
        if not r.get("nav_date"):
            continue
        ops.append(
            UpdateOne(
                {"scheme_code": r["scheme_code"], "nav_date": r["nav_date"]},
                {
                    "$set": {
                        "scheme_code": r["scheme_code"],
                        "nav_date": r["nav_date"],
                        "nav_value": r["nav_value"],
                        "scheme_name": r.get("scheme_name"),
                        "isin_growth": r.get("isin_growth"),
                        "isin_div": r.get("isin_div"),
                        "amc_name": r.get("amc_name"),
                        "scheme_category": r.get("scheme_category"),
                        "scheme_type": r.get("scheme_type"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
                upsert=True,
            )
        )
    if not ops:
        return 0
    CHUNK = 1000
    written = 0
    for i in range(0, len(ops), CHUNK):
        res = db.nav_master_history.bulk_write(ops[i : i + CHUNK], ordered=False)
        written += (res.upserted_count or 0) + (res.modified_count or 0)
    return written


def _bulk_upsert_nav(db, slot: str, rows: Iterable[Dict]) -> Tuple[int, int]:
    """
    Upsert one NAV bucket slot (`nav_current` | `nav_3y` | `nav_5y` |
    `nav_2018`) on the latest-snapshot collection `nav_master`.

    Returns (upserted_count, modified_count).
    """
    assert slot in ("nav_current", "nav_3y", "nav_5y", "nav_2018")

    ops: List[UpdateOne] = []
    for r in rows:
        ops.append(
            UpdateOne(
                {"scheme_code": r["scheme_code"]},
                {
                    "$set": {
                        "scheme_code": r["scheme_code"],
                        "scheme_name": r["scheme_name"],
                        "isin_growth": r.get("isin_growth"),
                        "isin_div": r.get("isin_div"),
                        "amc_name": r.get("amc_name"),
                        "scheme_category": r.get("scheme_category"),
                        "scheme_type": r.get("scheme_type"),
                        slot: {
                            "value": r["nav_value"],
                            "date": r.get("nav_date"),
                        },
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
                upsert=True,
            )
        )

    if not ops:
        return 0, 0

    # Chunked write to stay under 16 MB BSON limit
    CHUNK = 1000
    upserted = 0
    modified = 0
    for i in range(0, len(ops), CHUNK):
        res = db.nav_master.bulk_write(ops[i : i + CHUNK], ordered=False)
        upserted += len(res.upserted_ids or {})
        modified += res.modified_count or 0
    return upserted, modified


# -----------------------------------------------------------------------------
# High-level sync
# -----------------------------------------------------------------------------
def _years_back_business_date(years: int) -> date:
    """
    Return today - `years` years. If that lands on a weekend, AMFI returns
    nothing — walk back to the previous business day (Fri) as a small
    robustness measure.
    """
    target = date.today() - relativedelta(years=years)
    # Saturday=5, Sunday=6 -> walk to Friday
    while target.weekday() >= 5:
        target -= timedelta(days=1)
    return target


def run_nav_master_sync(db, *, include_daily: bool = True, include_3y: bool = True,
                        include_5y: bool = True, include_2018: bool = False) -> Dict:
    """
    End-to-end NAV Master sync.

    * Appends each day's NAV rows to `nav_master_history` (previous data is
      preserved — we never overwrite older dates).
    * Upserts the latest-snapshot pointers (`nav_current` / `nav_3y` /
      `nav_5y` / `nav_2018`) on `nav_master`.

    Writes progress into MongoDB collection `nav_master_logs`.
    """
    _ensure_indexes(db)

    started_at = datetime.now(timezone.utc)
    log_doc: Dict = {
        "type": "scheduled_nav_master",
        "started_at": started_at.isoformat(),
        "status": "running",
        "steps": [],
    }
    log_id = db.nav_master_logs.insert_one(log_doc).inserted_id

    result: Dict = {
        "daily": {"fetched": 0, "upserted": 0, "modified": 0, "history": 0, "error": None},
        "three_year": {"fetched": 0, "upserted": 0, "modified": 0, "history": 0, "error": None,
                       "target_date": None},
        "five_year": {"fetched": 0, "upserted": 0, "modified": 0, "history": 0, "error": None,
                      "target_date": None},
        "jan_2018": {"fetched": 0, "upserted": 0, "modified": 0, "history": 0, "error": None,
                     "target_date": None},
    }

    def _step(name: str, payload: Dict) -> None:
        db.nav_master_logs.update_one(
            {"_id": log_id},
            {"$push": {"steps": {"name": name, "at": datetime.now(timezone.utc).isoformat(), **payload}}},
        )

    def _run_bucket(bucket_key: str, slot: str, rows: List[Dict]) -> None:
        up, mod = _bulk_upsert_nav(db, slot, rows)
        hist = _bulk_append_history(db, rows)
        result[bucket_key].update({
            "fetched": len(rows), "upserted": up, "modified": mod, "history": hist,
        })

    # 1) Daily / current
    if include_daily:
        try:
            rows = fetch_daily_nav_rows()
            _run_bucket("daily", "nav_current", rows)
        except Exception as exc:
            logger.exception("NAV Master: daily fetch failed")
            result["daily"]["error"] = str(exc)
        _step("daily", result["daily"])

    # 2) 3-year historical
    if include_3y:
        try:
            target = _years_back_business_date(3)
            result["three_year"]["target_date"] = target.isoformat()
            rows = fetch_historical_nav_rows(target)
            _run_bucket("three_year", "nav_3y", rows)
        except Exception as exc:
            logger.exception("NAV Master: 3-year fetch failed")
            result["three_year"]["error"] = str(exc)
        _step("three_year", result["three_year"])

    # 3) 5-year historical
    if include_5y:
        try:
            target = _years_back_business_date(5)
            result["five_year"]["target_date"] = target.isoformat()
            rows = fetch_historical_nav_rows(target)
            _run_bucket("five_year", "nav_5y", rows)
        except Exception as exc:
            logger.exception("NAV Master: 5-year fetch failed")
            result["five_year"]["error"] = str(exc)
        _step("five_year", result["five_year"])

    # 4) 31-Jan-2018 grandfathering (LTCG)
    if include_2018:
        try:
            target = date(2018, 1, 31)
            result["jan_2018"]["target_date"] = target.isoformat()
            rows = fetch_historical_nav_rows(target)
            _run_bucket("jan_2018", "nav_2018", rows)
        except Exception as exc:
            logger.exception("NAV Master: 31-Jan-2018 fetch failed")
            result["jan_2018"]["error"] = str(exc)
        _step("jan_2018", result["jan_2018"])

    finished_at = datetime.now(timezone.utc)
    had_error = any(v.get("error") for v in result.values())
    db.nav_master_logs.update_one(
        {"_id": log_id},
        {
            "$set": {
                "status": "completed_with_errors" if had_error else "completed",
                "finished_at": finished_at.isoformat(),
                "duration_seconds": (finished_at - started_at).total_seconds(),
                "result": result,
            }
        },
    )
    logger.info("NAV Master sync finished: %s", result)
    return result


def fetch_31jan_2018_navs(db) -> Dict:
    """
    One-shot fetch for 31-Jan-2018 NAVs (used for LTCG grandfathering).
    Writes to both `nav_master.nav_2018` and the `nav_master_history`
    time-series collection. Safe to call repeatedly.
    """
    return run_nav_master_sync(
        db, include_daily=False, include_3y=False, include_5y=False,
        include_2018=True,
    )


# -----------------------------------------------------------------------------
# Light status helper for the API layer
# -----------------------------------------------------------------------------
def get_nav_master_status(db) -> Dict:
    total = db.nav_master.count_documents({})
    with_current = db.nav_master.count_documents({"nav_current.value": {"$exists": True}})
    with_3y = db.nav_master.count_documents({"nav_3y.value": {"$exists": True}})
    with_5y = db.nav_master.count_documents({"nav_5y.value": {"$exists": True}})
    with_2018 = db.nav_master.count_documents({"nav_2018.value": {"$exists": True}})
    missing = total - with_current

    growth = db.nav_master.count_documents({"scheme_type": "Growth", "nav_current.value": {"$exists": True}})
    idcw = db.nav_master.count_documents({"scheme_type": "IDCW", "nav_current.value": {"$exists": True}})

    history_total = db.nav_master_history.estimated_document_count()
    history_unique_dates = len(db.nav_master_history.distinct("nav_date")) if history_total < 500_000 else None

    return {
        "total_schemes": total,
        "with_current_nav": with_current,
        "with_3y_nav": with_3y,
        "with_5y_nav": with_5y,
        "with_2018_nav": with_2018,
        "missing_nav": max(0, missing),
        "growth_with_nav": growth,
        "idcw_with_nav": idcw,
        "history_rows": history_total,
        "history_unique_dates": history_unique_dates,
    }
