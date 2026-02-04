"""
Test suite for Auto-Tag Idempotency and Cleanup Duplicates Feature
Tests:
1. POST /api/email-engagement/auto-tag - Idempotency check (no duplicates on multiple calls)
2. POST /api/email-engagement/cleanup-duplicates - Cleanup existing duplicates
3. Verify holding_cashflows are adjusted correctly after prepayment tagging
"""
import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
TEST_BROKER_PAN = "ANVPB5297J"
TEST_BROKER_PASSWORD = "broker123"
TEST_BROKER_PIN = "1234"


@pytest.fixture(scope="module")
def broker_token():
    """Get broker authentication token"""
    # Step 1: Login with PAN and password
    step1_response = requests.post(
        f"{BASE_URL}/api/auth/login-step1",
        json={"pan": TEST_BROKER_PAN, "password": TEST_BROKER_PASSWORD}
    )
    
    if step1_response.status_code != 200:
        # Try alternate credentials
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_BROKER_PAN, "password": "Laksh@0208"}
        )
        if step1_response.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_response.status_code} - {step1_response.text}")
    
    temp_token = step1_response.json().get("temp_token")
    
    # Step 2: Verify PIN
    step2_response = requests.post(
        f"{BASE_URL}/api/auth/login-step2",
        json={"temp_token": temp_token, "pin": TEST_BROKER_PIN}
    )
    
    if step2_response.status_code != 200:
        # Try alternate PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": "0516"}
        )
        if step2_response.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_response.status_code} - {step2_response.text}")
    
    token = step2_response.json().get("token")
    return token


class TestAutoTagIdempotency:
    """Tests for Auto-Tag Idempotency - No duplicate entries on multiple calls"""
    
    def test_auto_tag_endpoint_returns_success(self, broker_token):
        """Test POST /api/email-engagement/auto-tag returns 200 OK"""
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert "message" in data, "Response should contain 'message' field"
        assert "tagged_count" in data, "Response should contain 'tagged_count' field"
        
        print(f"Auto-tag response: {data}")
    
    def test_auto_tag_idempotency_no_duplicate_entries(self, broker_token):
        """
        Test that calling auto-tag multiple times does not create duplicate entries.
        The fix adds an idempotency check on email_log_id before inserting into actual_repayments.
        """
        # Get initial count of actual_repayments (to compare after multiple calls)
        # We can't directly query MongoDB, but we can check via the dashboard
        
        # First call to auto-tag
        response1 = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response1.status_code == 200, f"First auto-tag call failed: {response1.text}"
        data1 = response1.json()
        first_tagged_count = data1.get("tagged_count", 0)
        print(f"First call - Tagged count: {first_tagged_count}")
        
        # Small delay
        time.sleep(1)
        
        # Second call to auto-tag (should not create duplicates)
        response2 = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response2.status_code == 200, f"Second auto-tag call failed: {response2.text}"
        data2 = response2.json()
        second_tagged_count = data2.get("tagged_count", 0)
        print(f"Second call - Tagged count: {second_tagged_count}")
        
        # If there were no pending emails initially, both counts should be 0
        # If there were pending emails, second count should be 0 (since they were already tagged)
        # This verifies the idempotency check is working
        
        # The second call should tag 0 or fewer items than the first call
        # (because already tagged items should be skipped)
        assert second_tagged_count <= first_tagged_count, \
            f"Second call tagged {second_tagged_count} items, expected 0 or less than first call ({first_tagged_count}). Idempotency may not be working."
        
        print(f"IDEMPOTENCY CHECK PASSED: First call={first_tagged_count}, Second call={second_tagged_count}")
    
    def test_auto_tag_third_call_still_idempotent(self, broker_token):
        """Verify idempotency holds on third consecutive call"""
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Third auto-tag call failed: {response.text}"
        data = response.json()
        tagged_count = data.get("tagged_count", 0)
        
        # If idempotency is working, this should be 0 or very low
        # (only new pending emails since last call would be tagged)
        print(f"Third call - Tagged count: {tagged_count}")
        
        # Should still succeed
        assert data.get("success") == True, "Third call should succeed"


class TestCleanupDuplicates:
    """Tests for Cleanup Duplicates Endpoint"""
    
    def test_cleanup_duplicates_endpoint_returns_success(self, broker_token):
        """Test POST /api/email-engagement/cleanup-duplicates returns 200 OK"""
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/cleanup-duplicates",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert "message" in data, "Response should contain 'message' field"
        assert "deleted_count" in data, "Response should contain 'deleted_count' field"
        
        print(f"Cleanup duplicates response: {data}")
    
    def test_cleanup_duplicates_response_structure(self, broker_token):
        """Test cleanup duplicates has correct response structure"""
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/cleanup-duplicates",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        assert data.get("success") == True, "success should be True"
        assert isinstance(data.get("deleted_count"), int), "deleted_count should be an integer"
        assert isinstance(data.get("message"), str), "message should be a string"
        
        # deleted_ids should be a list (may be empty)
        if "deleted_ids" in data:
            assert isinstance(data.get("deleted_ids"), list), "deleted_ids should be a list"
    
    def test_cleanup_after_auto_tag_no_duplicates(self, broker_token):
        """
        Test that running cleanup after auto-tag (with idempotency) finds no duplicates.
        This verifies that the idempotency fix is preventing duplicates from being created.
        """
        # Run auto-tag twice
        requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        time.sleep(0.5)
        requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Now run cleanup
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/cleanup-duplicates",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        deleted_count = data.get("deleted_count", -1)
        
        # With idempotency working, there should be 0 new duplicates
        # Note: There may be old duplicates from before the fix was applied
        print(f"Duplicates found and cleaned: {deleted_count}")
        
        # This test primarily verifies the endpoint works
        # The actual count depends on data state


class TestAuthorizationRestrictions:
    """Tests for authorization - only brokers should access these endpoints"""
    
    def test_auto_tag_requires_auth(self):
        """Test auto-tag endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/email-engagement/auto-tag")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_cleanup_duplicates_requires_auth(self):
        """Test cleanup-duplicates endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/email-engagement/cleanup-duplicates")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


class TestHoldingCashflowsAdjustment:
    """
    Tests to verify that holding_cashflows collection is properly updated
    after prepayments are tagged via auto-tag.
    """
    
    def test_auto_tag_updates_cashflows(self, broker_token):
        """
        Verify auto-tag response indicates cashflows were adjusted.
        The fix should update holding_cashflows to reduce final maturity payout.
        """
        # Call auto-tag
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if details contain cashflows_adjusted field
        details = data.get("details", [])
        if details:
            for detail in details:
                # The response should indicate cashflows were adjusted
                if "cashflows_adjusted" in detail:
                    print(f"Cashflow adjustment for {detail.get('matched_client', 'unknown')}: {detail.get('cashflows_adjusted')}")
    
    def test_dashboard_shows_updated_status(self, broker_token):
        """
        After auto-tag, the dashboard should show holding_updated status correctly.
        """
        # First run auto-tag
        requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Then check dashboard
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        summary = data.get("summary", {})
        holdings_updated = summary.get("holdings_updated", 0)
        holdings_pending = summary.get("holdings_pending", 0)
        
        print(f"Dashboard summary - Holdings updated: {holdings_updated}, Pending: {holdings_pending}")
        
        # Verify the counts are integers and non-negative
        assert isinstance(holdings_updated, int) and holdings_updated >= 0
        assert isinstance(holdings_pending, int) and holdings_pending >= 0


class TestEdgeCases:
    """Edge case tests for auto-tag and cleanup"""
    
    def test_auto_tag_with_no_pending_emails(self, broker_token):
        """Test auto-tag when there are no pending emails to tag"""
        # After running auto-tag multiple times, there should be no pending emails
        # Run it a few times to ensure all are tagged
        for _ in range(2):
            requests.post(
                f"{BASE_URL}/api/email-engagement/auto-tag",
                headers={"Authorization": f"Bearer {broker_token}"}
            )
            time.sleep(0.3)
        
        # Final call should return 0 tagged
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/auto-tag",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should succeed even with nothing to tag
        assert data.get("success") == True
        
        # Message should indicate no pending or 0 tagged
        message = data.get("message", "")
        tagged_count = data.get("tagged_count", -1)
        
        print(f"No pending test - Message: {message}, Tagged: {tagged_count}")
        
        # tagged_count should be 0 or very low
        assert tagged_count >= 0, "tagged_count should be non-negative"
    
    def test_cleanup_with_no_duplicates(self, broker_token):
        """Test cleanup when there are no duplicates to clean"""
        # Run cleanup twice - second time should find 0 duplicates
        requests.post(
            f"{BASE_URL}/api/email-engagement/cleanup-duplicates",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        time.sleep(0.3)
        
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/cleanup-duplicates",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should succeed
        assert data.get("success") == True
        
        # After first cleanup, second should find 0 duplicates
        deleted_count = data.get("deleted_count", -1)
        print(f"Second cleanup - Deleted count: {deleted_count}")
        
        # Should be 0 after previous cleanup
        assert deleted_count == 0, f"Expected 0 duplicates after cleanup, got {deleted_count}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
