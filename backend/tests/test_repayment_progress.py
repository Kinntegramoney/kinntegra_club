"""Tests for NCD repayment progress calculation based on cashflow dates vs today.

The fix under test: `/api/bonds` and `/api/bonds/available` should return:
  - total_cashflows_count = number of expected cashflow dates in cashflows_per_unit
  - repaid_cashflows_count = number of those dates <= today (UTC, YYYY-MM-DD)
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SUPERUSER_PAN = "SUPERUSER"
SUPERUSER_PASSWORD = "kinntegraa123"
SUPERUSER_PIN = "1234"


@pytest.fixture(scope="module")
def auth_token():
    s = requests.Session()
    r1 = s.post(
        f"{BASE_URL}/api/auth/login-step1",
        json={"pan": SUPERUSER_PAN, "password": SUPERUSER_PASSWORD},
        timeout=30,
    )
    assert r1.status_code == 200, f"Step1 failed: {r1.status_code} {r1.text}"
    temp_token = r1.json()["temp_token"]

    r2 = s.post(
        f"{BASE_URL}/api/auth/login-step2",
        json={"temp_token": temp_token, "pin": SUPERUSER_PIN},
        timeout=30,
    )
    assert r2.status_code == 200, f"Step2 failed: {r2.status_code} {r2.text}"
    token = r2.json()["token"]
    assert token
    return token


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


# ---------- Endpoint status tests ----------

def test_bonds_endpoint_ok(client):
    r = client.get(f"{BASE_URL}/api/bonds?page=1&limit=50", timeout=60)
    assert r.status_code == 200, f"Body: {r.text[:500]}"
    body = r.json()
    assert "data" in body and isinstance(body["data"], list)
    assert "pagination" in body


def test_bonds_available_endpoint_ok(client):
    r = client.get(f"{BASE_URL}/api/bonds/available", timeout=60)
    assert r.status_code == 200, f"Body: {r.text[:500]}"
    assert isinstance(r.json(), list)


# ---------- Response structure tests ----------

def _validate_bond_counts(bond):
    assert "total_cashflows_count" in bond, "Missing total_cashflows_count"
    assert "repaid_cashflows_count" in bond, "Missing repaid_cashflows_count"
    total = bond["total_cashflows_count"]
    repaid = bond["repaid_cashflows_count"]
    assert isinstance(total, int)
    assert isinstance(repaid, int)
    assert total >= 0
    assert repaid >= 0
    assert repaid <= total, f"repaid ({repaid}) exceeds total ({total}) for bond {bond.get('id')}"


def test_bonds_response_has_cashflow_counts(client):
    r = client.get(f"{BASE_URL}/api/bonds?page=1&limit=50", timeout=60)
    assert r.status_code == 200
    bonds = r.json().get("data", [])
    if not bonds:
        pytest.skip("No bonds in DB to validate structure")
    for b in bonds:
        _validate_bond_counts(b)


def test_bonds_available_response_has_cashflow_counts(client):
    r = client.get(f"{BASE_URL}/api/bonds/available", timeout=60)
    assert r.status_code == 200
    bonds = r.json()
    if not bonds:
        pytest.skip("No available bonds in DB to validate structure")
    for b in bonds:
        _validate_bond_counts(b)


# ---------- Calculation correctness ----------

def _recompute_counts(cashflows_per_unit):
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    expected, repaid = [], []
    for cf in cashflows_per_unit or []:
        d = cf.get("date")
        if d:
            expected.append(d)
            if d <= today_str:
                repaid.append(d)
    return len(expected), len(repaid)


def test_bonds_counts_match_cashflows_per_unit(client):
    """Recompute counts from the cashflows_per_unit field returned in the list itself."""
    r = client.get(f"{BASE_URL}/api/bonds?page=1&limit=50", timeout=60)
    assert r.status_code == 200
    bonds = r.json().get("data", [])
    if not bonds:
        pytest.skip("No bonds to verify calculation")

    validated = 0
    for b in bonds[:10]:  # cap to keep test fast
        cfs = b.get("cashflows_per_unit") or []
        if not cfs:
            continue
        exp_total, exp_repaid = _recompute_counts(cfs)
        assert b["total_cashflows_count"] == exp_total, (
            f"Bond {b['id']}: total_cashflows_count={b['total_cashflows_count']} "
            f"but expected {exp_total} based on cashflows_per_unit"
        )
        assert b["repaid_cashflows_count"] == exp_repaid, (
            f"Bond {b['id']}: repaid_cashflows_count={b['repaid_cashflows_count']} "
            f"but expected {exp_repaid} based on today's date"
        )
        validated += 1

    if validated == 0:
        pytest.skip("No bond details retrievable to compare")


def test_repaid_count_is_time_based_not_repayment_based(client):
    """Sanity check: repaid count should equal number of past-dated cashflows,
    which is time-based logic (not tied to Ncd_Repayments)."""
    r = client.get(f"{BASE_URL}/api/bonds?page=1&limit=50", timeout=60)
    assert r.status_code == 200
    bonds = r.json().get("data", [])
    if not bonds:
        pytest.skip("No bonds")

    today = datetime.now(timezone.utc).date()
    checked = 0
    for b in bonds[:10]:
        cfs = b.get("cashflows_per_unit") or []
        if not cfs:
            continue
        # Count strictly past + today
        past = 0
        for cf in cfs:
            d = cf.get("date")
            if not d:
                continue
            try:
                cf_date = datetime.strptime(d[:10], "%Y-%m-%d").date()
            except Exception:
                continue
            if cf_date <= today:
                past += 1
        assert b["repaid_cashflows_count"] == past, (
            f"Bond {b['id']}: repaid={b['repaid_cashflows_count']} vs past-dates={past}"
        )
        checked += 1
    if checked == 0:
        pytest.skip("No cashflows to compare")
