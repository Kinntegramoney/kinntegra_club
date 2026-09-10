"""Test PUT /api/data-gathering/family/{id} with null life_expectancy on members
(this is the endpoint used by the DataGathering 'Save & Next' handleSave flow).
Reproduces the reported bug: clearing a family member's life_expectancy and clicking
'Save and Next' should persist null instead of coercing to 85.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
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


_SENTINEL = object()

def _build_family_payload(fam, override_member_le=_SENTINEL):
    """Rebuild the payload the frontend handleSave sends."""
    primary = next((m for m in fam["members"] if m.get("is_primary")), fam["members"][0])
    others = [m for m in fam["members"] if not m.get("is_primary")]
    payload = {
        "broker_id": fam.get("broker_id"),
        "sub_broker_id": fam.get("sub_broker_id"),
        "proceed_option": fam.get("proceed_option", "Data Gathering"),
        "primary_holder": {
            "name": primary["name"],
            "date_of_birth": primary["date_of_birth"],
            "relation": "Primary",
            "life_expectancy": primary.get("life_expectancy"),
            "retirement_year": primary.get("retirement_year"),
            "tax_regime": primary.get("tax_regime"),
            "tax_status": primary.get("tax_status"),
            "tax_slab": primary.get("tax_slab"),
        },
        "members": [
            {
                "name": m["name"],
                "date_of_birth": m["date_of_birth"],
                "relation": m.get("relation", "Spouse"),
                # Override to None for non-primary if requested
                "life_expectancy": override_member_le if override_member_le is not _SENTINEL else m.get("life_expectancy"),
                "retirement_year": m.get("retirement_year"),
                "tax_regime": m.get("tax_regime"),
                "tax_status": m.get("tax_status"),
                "tax_slab": m.get("tax_slab"),
            }
            for m in others
        ],
    }
    return payload, primary, others


def test_family_put_persists_null_life_expectancy_for_non_primary(headers):
    fam = _get_family(headers)
    if len([m for m in fam["members"] if not m.get("is_primary")]) == 0:
        pytest.skip("Family has no non-primary members")

    original_les = {m["id"]: m.get("life_expectancy") for m in fam["members"] if not m.get("is_primary")}

    payload, primary, others = _build_family_payload(fam, override_member_le=None)

    r = requests.put(f"{API}/data-gathering/family/{TEST_FAMILY_ID}", json=payload, headers=headers)
    assert r.status_code == 200, r.text

    # Verify persistence
    fam2 = _get_family(headers)
    non_primaries = [m for m in fam2["members"] if not m.get("is_primary")]
    assert len(non_primaries) > 0
    for m in non_primaries:
        assert m.get("life_expectancy") is None, (
            f"Expected null for non-primary member {m['name']}, got {m.get('life_expectancy')}"
        )

    # Primary should still have its life_expectancy
    p = next(m for m in fam2["members"] if m.get("is_primary"))
    assert p.get("life_expectancy") == primary.get("life_expectancy")

    # Restore
    restore_payload, _, _ = _build_family_payload(fam)
    # Actually preserve original values per member id — match by index/name
    restore_payload["members"] = [
        {**mm, "life_expectancy": original_les.get(next((o["id"] for o in others if o["name"] == mm["name"]), None), 85)}
        for mm in restore_payload["members"]
    ]
    requests.put(f"{API}/data-gathering/family/{TEST_FAMILY_ID}", json=restore_payload, headers=headers)
