"""
Regression tests for MFD (sub_broker) family creation and access control.
Bug: MFD created families were not tagged with sub_broker_id/created_by → Access Denied.
Fix: create_family now sets sub_broker_id and created_by to MFD's user_id; list/detail
endpoints allow access if either field matches.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

MFD_LOGIN_ID = "1994108"  # `users` collection has role=sub_broker; effective role used by APIs
MFD_PASSWORD = "kinntegraa123"
MFD_PIN = "1234"

SUPERUSER_LOGIN = "SUPERUSER"
SUPERUSER_PASSWORD = "kinntegraa123"
SUPERUSER_PIN = "1234"


def _login(login_id, password, pin):
    r1 = requests.post(f"{BASE_URL}/api/auth/login-step1",
                       json={"pan": login_id, "password": password}, timeout=30)
    assert r1.status_code == 200, f"step1 failed for {login_id}: {r1.status_code} {r1.text}"
    temp = r1.json()["temp_token"]
    r2 = requests.post(f"{BASE_URL}/api/auth/login-step2",
                       json={"temp_token": temp, "pin": pin}, timeout=30)
    assert r2.status_code == 200, f"step2 failed for {login_id}: {r2.status_code} {r2.text}"
    data = r2.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def mfd_session():
    token, user = _login(MFD_LOGIN_ID, MFD_PASSWORD, MFD_PIN)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, user


@pytest.fixture(scope="module")
def created_family_ids():
    """Track family IDs to clean up after tests."""
    ids = []
    yield ids
    # No delete endpoint; leave data (prefixed with TEST_MFD_ for easy identification)


def _family_payload(name):
    return {
        "proceed_option": "Data Gathering",
        "primary_holder": {
            "name": name,
            "date_of_birth": "1985-06-15",
            "relation": "Primary",
            "life_expectancy": 85,
            "retirement_year": 2050,
            "tax_regime": "New Regime",
            "tax_status": "Resident",
            "tax_slab": "30%",
        },
        "members": [],
    }


class TestMFDFamilyCreation:
    def test_mfd_login_returns_user_info(self, mfd_session):
        _, user = mfd_session
        # Note: login-step2 returns role from JWT (login_type-based) which is 'broker'
        # for these accounts, but get_current_user hydrates from `users` collection
        # where role='sub_broker'. Downstream family APIs use the effective role.
        assert user.get("id"), "MFD user has no id"
        assert user.get("login_id") == MFD_LOGIN_ID

    def test_create_family_sets_created_by_and_sub_broker_id(self, mfd_session, created_family_ids):
        session, user = mfd_session
        name = f"TEST_MFD_Primary_{uuid.uuid4().hex[:8]}"
        r = session.post(f"{BASE_URL}/api/data-gathering/family",
                         json=_family_payload(name), timeout=30)
        assert r.status_code == 200, f"create family failed: {r.status_code} {r.text}"
        fam = r.json()["family"]
        created_family_ids.append(fam["id"])

        assert fam["created_by"] == user["id"], (
            f"created_by mismatch: expected {user['id']}, got {fam.get('created_by')}"
        )
        assert fam["sub_broker_id"] == user["id"], (
            f"sub_broker_id should auto-tag to MFD id: expected {user['id']}, got {fam.get('sub_broker_id')}"
        )
        assert fam["created_by_role"] == "sub_broker"
        assert fam["family_name"].startswith(name)

    def test_mfd_can_list_created_family(self, mfd_session, created_family_ids):
        session, _ = mfd_session
        r = session.get(f"{BASE_URL}/api/data-gathering/families", timeout=30)
        assert r.status_code == 200, f"list failed: {r.text}"
        ids = [f["id"] for f in r.json().get("families", [])]
        for fid in created_family_ids:
            assert fid in ids, f"MFD-created family {fid} missing from list"

    def test_mfd_can_get_family_details(self, mfd_session, created_family_ids):
        session, _ = mfd_session
        assert created_family_ids, "No family created in previous test"
        fid = created_family_ids[0]
        r = session.get(f"{BASE_URL}/api/data-gathering/family/{fid}", timeout=30)
        assert r.status_code == 200, f"get details failed: {r.status_code} {r.text}"
        assert r.json()["id"] == fid

    def test_mfd_can_update_own_family(self, mfd_session, created_family_ids):
        session, user = mfd_session
        assert created_family_ids
        fid = created_family_ids[0]
        payload = _family_payload(f"TEST_MFD_Updated_{uuid.uuid4().hex[:6]}")
        r = session.put(f"{BASE_URL}/api/data-gathering/family/{fid}",
                        json=payload, timeout=30)
        assert r.status_code == 200, f"update failed: {r.status_code} {r.text}"
        # After update, MFD should still be able to fetch
        r2 = session.get(f"{BASE_URL}/api/data-gathering/family/{fid}", timeout=30)
        assert r2.status_code == 200, f"post-update fetch access denied: {r2.status_code} {r2.text}"

    def test_family_visible_by_created_by_when_sub_broker_id_null(self, mfd_session, created_family_ids):
        """Simulate the original bug case: sub_broker_id null, created_by=MFD.
        Insert directly via a family created with explicit null sub_broker_id.
        Since the API auto-fills sub_broker_id, we manually null it via update where
        request.sub_broker_id is omitted -> server sets it to request.sub_broker_id (None).
        Then verify MFD can still list & access via created_by fallback."""
        session, user = mfd_session
        # Create a fresh family
        name = f"TEST_MFD_NullSub_{uuid.uuid4().hex[:8]}"
        r = session.post(f"{BASE_URL}/api/data-gathering/family",
                         json=_family_payload(name), timeout=30)
        assert r.status_code == 200
        fam = r.json()["family"]
        fid = fam["id"]
        created_family_ids.append(fid)

        # Update without sub_broker_id -> becomes None per current update logic
        upd = _family_payload(name)
        upd["sub_broker_id"] = None
        ru = session.put(f"{BASE_URL}/api/data-gathering/family/{fid}", json=upd, timeout=30)
        assert ru.status_code == 200, ru.text

        # Now list should still contain it (via created_by branch)
        rl = session.get(f"{BASE_URL}/api/data-gathering/families", timeout=30)
        assert rl.status_code == 200
        assert fid in [f["id"] for f in rl.json()["families"]], \
            "Family with null sub_broker_id but created_by=MFD is missing from list"

        # Detail access should not return 403
        rd = session.get(f"{BASE_URL}/api/data-gathering/family/{fid}", timeout=30)
        assert rd.status_code == 200, f"Access denied when sub_broker_id is null: {rd.status_code} {rd.text}"


class TestOtherMFDCannotAccess:
    """Ensure a different MFD cannot access family created by MFD 1994108."""

    def test_other_mfd_cannot_view(self, mfd_session, created_family_ids):
        if not created_family_ids:
            pytest.skip("No family created")
        fid = created_family_ids[0]
        try:
            token, _ = _login("1994102", MFD_PASSWORD, MFD_PIN)
        except AssertionError:
            pytest.skip("MFD 1994102 login not available")
        r = requests.get(f"{BASE_URL}/api/data-gathering/family/{fid}",
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r.status_code == 403, f"Expected 403 for other MFD, got {r.status_code}: {r.text}"
