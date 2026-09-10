"""Test that empty life_expectancy is persisted as null on family members."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
TEST_FAMILY_ID = "869d412b-0cb8-4839-9459-d2a02b2860f1"


@pytest.fixture(scope="module")
def token():
    s = requests.Session()
    r = s.post(f"{API}/auth/login-step1", json={"pan": "SUPERUSER", "password": "kinntegraa123"})
    assert r.status_code == 200, r.text
    temp = r.json()["temp_token"]
    r = s.post(f"{API}/auth/login-step2", json={"temp_token": temp, "pin": "1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_family(headers):
    r = requests.get(f"{API}/data-gathering/family/{TEST_FAMILY_ID}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_family_exists(headers):
    fam = _get_family(headers)
    assert "members" in fam
    assert len(fam["members"]) > 0


def test_update_member_with_null_life_expectancy(headers):
    fam = _get_family(headers)
    # pick a non-primary member if exists, else primary
    member = next((m for m in fam["members"] if not m.get("is_primary")), fam["members"][0])
    member_id = member["id"]
    original_le = member.get("life_expectancy")

    payload = {
        "name": member["name"],
        "date_of_birth": member["date_of_birth"],
        "relation": member.get("relation", "Spouse") if not member.get("is_primary") else "Spouse",
        "life_expectancy": None,
        "tax_slab": member.get("tax_slab", "30%"),
    }
    r = requests.put(
        f"{API}/data-gathering/family/{TEST_FAMILY_ID}/member/{member_id}",
        json=payload, headers=headers,
    )
    assert r.status_code == 200, r.text

    # Verify persistence
    fam2 = _get_family(headers)
    updated = next(m for m in fam2["members"] if m["id"] == member_id)
    assert updated.get("life_expectancy") is None, f"Expected null, got {updated.get('life_expectancy')}"

    # Restore
    payload["life_expectancy"] = original_le if original_le is not None else 85
    requests.put(
        f"{API}/data-gathering/family/{TEST_FAMILY_ID}/member/{member_id}",
        json=payload, headers=headers,
    )


def test_update_member_with_integer_life_expectancy(headers):
    fam = _get_family(headers)
    member = next((m for m in fam["members"] if not m.get("is_primary")), fam["members"][0])
    member_id = member["id"]

    payload = {
        "name": member["name"],
        "date_of_birth": member["date_of_birth"],
        "relation": member.get("relation", "Spouse") if not member.get("is_primary") else "Spouse",
        "life_expectancy": 90,
        "tax_slab": member.get("tax_slab", "30%"),
    }
    r = requests.put(
        f"{API}/data-gathering/family/{TEST_FAMILY_ID}/member/{member_id}",
        json=payload, headers=headers,
    )
    assert r.status_code == 200, r.text

    fam2 = _get_family(headers)
    updated = next(m for m in fam2["members"] if m["id"] == member_id)
    assert updated.get("life_expectancy") == 90
