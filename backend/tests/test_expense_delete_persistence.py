"""
Bug 1 regression test: verify that DELETE /api/data-gathering/family/{id}/expense/{id}
actually removes the expense from the database so it does not reappear in subsequent
GET calls (which back the Excel export).

Also covers rapid create -> delete -> create sequences (user reported that after
deleting and re-adding, both old and new values appeared).
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

SUPERUSER_PAN = "SUPERUSER"
SUPERUSER_PWD = "kinntegraa123"
SUPERUSER_PIN = "1234"


def _login():
    r1 = requests.post(f"{BASE_URL}/api/auth/login-step1",
                       json={"pan": SUPERUSER_PAN, "password": SUPERUSER_PWD})
    assert r1.status_code == 200, r1.text
    temp = r1.json()["temp_token"]
    r2 = requests.post(f"{BASE_URL}/api/auth/login-step2",
                       json={"temp_token": temp, "pin": SUPERUSER_PIN})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="module")
def token():
    return _login()


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def family_id(headers):
    """Reuse an existing family - creation model is complex and out-of-scope."""
    # Try known test family
    known = "7b59d56b-3034-4bb4-be73-98ea3a67d007"  # Test Gagan Vohra & Family
    r = requests.get(f"{BASE_URL}/api/data-gathering/family/{known}", headers=headers)
    if r.status_code == 200:
        yield known
        return
    # Fallback: pick the first family in the list
    r = requests.get(f"{BASE_URL}/api/data-gathering/families", headers=headers)
    assert r.status_code == 200, r.text
    fams = r.json()
    if isinstance(fams, dict):
        fams = fams.get("families", [])
    assert fams, "No families available to test against"
    yield fams[0]["id"]


def _add_expense(headers, fam_id, monthly_amount, member_id):
    body = {
        "family_id": fam_id,
        "member_ids": [member_id],
        "expense_type": "groceries",
        "monthly_amount": monthly_amount,
        "annual_amount": monthly_amount * 12,
        "upto_year": 2050,
        "inflation_percent": 5,
        "consider_post_retirement": False,
        "post_retirement_member": "",
        "post_retirement_percent": 100,
    }
    r = requests.post(f"{BASE_URL}/api/data-gathering/family/{fam_id}/expense",
                      json=body, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["expense"]["id"]


def _get_expenses(headers, fam_id):
    r = requests.get(f"{BASE_URL}/api/data-gathering/family/{fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json().get("expense_details", []) or []


def _get_member_id(headers, fam_id):
    r = requests.get(f"{BASE_URL}/api/data-gathering/family/{fam_id}", headers=headers)
    assert r.status_code == 200
    members = r.json().get("members", [])
    assert members, "family has no members"
    return members[0]["id"]


class TestExpenseDeletePersistence:
    def test_delete_removes_expense_from_get(self, headers, family_id):
        member_id = _get_member_id(headers, family_id)
        exp_id = _add_expense(headers, family_id, 25000, member_id)

        # Confirm present
        before = _get_expenses(headers, family_id)
        assert any(e["id"] == exp_id for e in before)

        # Delete
        r = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/expense/{exp_id}",
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # Confirm gone in the very next GET (single-call persistence)
        after = _get_expenses(headers, family_id)
        assert not any(e["id"] == exp_id for e in after), \
            "Expense still present after single DELETE - Bug 1 not fixed"

    def test_delete_then_readd_no_duplicates(self, headers, family_id):
        """User reported both old (25000) and new (18000) values appearing after
        delete+re-add. This test verifies only the new value persists."""
        member_id = _get_member_id(headers, family_id)
        # Clean any leftover groceries
        for e in _get_expenses(headers, family_id):
            if e.get("expense_type") == "groceries":
                requests.delete(
                    f"{BASE_URL}/api/data-gathering/family/{family_id}/expense/{e['id']}",
                    headers=headers,
                )

        # Add old value
        old_id = _add_expense(headers, family_id, 25000, member_id)
        # Delete it
        r = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/expense/{old_id}",
            headers=headers,
        )
        assert r.status_code == 200
        # Re-add with new value
        new_id = _add_expense(headers, family_id, 18000, member_id)

        groceries = [e for e in _get_expenses(headers, family_id)
                     if e.get("expense_type") == "groceries"]
        # Should be exactly one groceries entry with monthly=18000
        assert len(groceries) == 1, f"Expected 1 groceries entry, got {len(groceries)}: {groceries}"
        assert groceries[0]["monthly_amount"] == 18000
        assert groceries[0]["id"] == new_id
        assert old_id != new_id

    def test_double_delete_is_idempotent(self, headers, family_id):
        """Calling DELETE twice should not error and should keep the expense removed."""
        member_id = _get_member_id(headers, family_id)
        exp_id = _add_expense(headers, family_id, 5000, member_id)
        r1 = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/expense/{exp_id}",
            headers=headers,
        )
        assert r1.status_code == 200
        r2 = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/expense/{exp_id}",
            headers=headers,
        )
        # $pull on non-existent id should still return 200
        assert r2.status_code == 200, r2.text
        assert not any(e["id"] == exp_id for e in _get_expenses(headers, family_id))
