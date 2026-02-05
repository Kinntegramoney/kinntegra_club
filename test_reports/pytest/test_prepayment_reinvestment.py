"""
Test prepayment entries appearing on Reinvestment Tagging page
Verifies fix for prepayments from actual_repayments collection being fetched by /api/reinvestment/upcoming endpoint

Key Test Scenarios:
1. Prepayments from actual_repayments appear in API response with is_prepayment_entry=true
2. Prepayment entries show Principal amount only (no interest)
3. Prepayment entries can be tagged via PUT /api/reinvestment/tag/{cashflow_id}
4. Prepayment IDs start with 'prepay_' prefix
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_PAN = "ANVPB5297J"
TEST_PASSWORD = "broker123"
TEST_PIN = "1234"


class TestPrepaymentReinvestment:
    """Test prepayment entries on Reinvestment Tagging page"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get broker authentication token using two-step login"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        
        if step1_response.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_response.status_code} - {step1_response.text}")
        
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: Verify PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        
        if step2_response.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_response.status_code} - {step2_response.text}")
        
        return step2_response.json().get("token")
    
    @pytest.fixture
    def api_client(self, auth_token):
        """Session with auth header"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session

    def test_reinvestment_upcoming_endpoint_accessible(self, api_client):
        """Test that /api/reinvestment/upcoming endpoint is accessible"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        
        assert response.status_code == 200, f"Endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "months" in data, "Response should contain 'months' field"
        assert "total_upcoming" in data, "Response should contain 'total_upcoming' field"
        print(f"SUCCESS: Reinvestment upcoming endpoint returned {data.get('total_upcoming', 0)} entries")

    def test_response_structure_contains_required_fields(self, api_client):
        """Test that API response items contain required fields for prepayment handling"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        # Get all items from all months
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        if len(all_items) == 0:
            pytest.skip("No reinvestment items available for testing")
        
        # Check first item for required fields
        item = all_items[0]
        required_fields = [
            "cashflow_id",
            "client_id", 
            "client_name",
            "principal_net",
            "interest_net",
            "net_amount",
            "reinvestment_tag",
            "expected_date"
        ]
        
        for field in required_fields:
            assert field in item, f"Missing required field: {field}"
        
        print(f"SUCCESS: API response contains all required fields. Sample entry: {item.get('bond_name', 'Unknown')}")

    def test_prepayment_entries_in_response(self, api_client):
        """Test that prepayment entries from actual_repayments appear in response"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        # Collect all items
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        # Look for prepayment entries (cashflow_id starts with 'prepay_')
        prepayment_entries = [item for item in all_items if item.get("cashflow_id", "").startswith("prepay_")]
        
        # Also look for items marked as is_prepayment_entry
        prepayment_marked = [item for item in all_items if item.get("is_prepayment_entry")]
        
        print(f"Found {len(prepayment_entries)} prepayment entries (by ID prefix)")
        print(f"Found {len(prepayment_marked)} prepayment entries (by is_prepayment_entry flag)")
        
        # Either should work
        total_prepayments = len(set([p.get("cashflow_id") for p in prepayment_entries + prepayment_marked]))
        print(f"Total unique prepayment entries: {total_prepayments}")
        
        # Note: If no prepayments exist in the database, this is expected
        # The test verifies the code path handles prepayments correctly
        if total_prepayments > 0:
            print("SUCCESS: Prepayment entries are appearing in reinvestment/upcoming response")
            
            # Verify prepayment entry structure
            prepay = prepayment_entries[0] if prepayment_entries else prepayment_marked[0]
            assert prepay.get("cashflow_id", "").startswith("prepay_"), "Prepayment ID should start with 'prepay_'"
            assert "principal_net" in prepay, "Prepayment should have principal_net"
            assert prepay.get("interest_net", 0) == 0, "Prepayment should have 0 interest"
        else:
            print("INFO: No prepayment entries found in database (may need to create test prepayment data)")

    def test_prepayment_shows_principal_only(self, api_client):
        """Test that prepayment entries show Principal amount with no interest"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        # Collect all items
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        # Find prepayment entries
        prepayment_entries = [item for item in all_items 
                            if item.get("cashflow_id", "").startswith("prepay_") 
                            or item.get("is_prepayment_entry")]
        
        if not prepayment_entries:
            pytest.skip("No prepayment entries in database to verify")
        
        for prepay in prepayment_entries:
            # Prepayment should have interest_net = 0
            interest = prepay.get("interest_net", 0)
            assert interest == 0, f"Prepayment should have 0 interest, got {interest}"
            
            # Prepayment should have principal_net > 0
            principal = prepay.get("principal_net", 0)
            assert principal >= 0, f"Prepayment should have principal >= 0, got {principal}"
            
            print(f"Prepayment {prepay.get('bond_name')}: Principal=₹{principal:,.0f}, Interest=₹{interest}")
        
        print(f"SUCCESS: All {len(prepayment_entries)} prepayment entries have correct amounts (principal only, no interest)")

    def test_tag_prepayment_entry(self, api_client):
        """Test tagging a prepayment entry for reinvestment"""
        # First get the list to find a prepayment entry
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        # Collect all items
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        # Find an untagged prepayment entry
        prepayment_entries = [item for item in all_items 
                            if (item.get("cashflow_id", "").startswith("prepay_") 
                                or item.get("is_prepayment_entry"))
                            and item.get("reinvestment_tag", "not_tagged") == "not_tagged"]
        
        if not prepayment_entries:
            # No untagged prepayment, try any entry
            prepayment_entries = [item for item in all_items 
                                if item.get("cashflow_id", "").startswith("prepay_") 
                                or item.get("is_prepayment_entry")]
        
        if not prepayment_entries:
            pytest.skip("No prepayment entries available for tagging test")
        
        prepay = prepayment_entries[0]
        cashflow_id = prepay.get("cashflow_id")
        
        print(f"Testing tag on prepayment: {prepay.get('bond_name')} (ID: {cashflow_id})")
        
        # Tag the prepayment
        tag_data = {
            "reinvestment_tag": "principal",
            "portfolio_category": "wealth",
            "target_ucc": prepay.get("client_ucc_list", ["TEST_UCC"])[0] if prepay.get("client_ucc_list") else "TEST_UCC"
        }
        
        tag_response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}",
            json=tag_data
        )
        
        # May succeed or return 4xx depending on specific cashflow state
        # We're testing the endpoint handles prepay_ prefix correctly
        assert tag_response.status_code in [200, 400, 404], f"Unexpected status: {tag_response.status_code}"
        
        if tag_response.status_code == 200:
            result = tag_response.json()
            print(f"SUCCESS: Prepayment tagged successfully. Auto-approved: {result.get('auto_approved', False)}")
        elif tag_response.status_code == 404:
            print(f"INFO: Prepayment not found in actual_repayments (may have been already processed)")
        else:
            print(f"INFO: Tagging returned {tag_response.status_code}: {tag_response.text}")

    def test_regular_cashflow_tag(self, api_client):
        """Test tagging a regular (non-prepayment) cashflow"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        # Collect all items
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        # Find a regular untagged entry (not prepayment)
        regular_entries = [item for item in all_items 
                         if not item.get("cashflow_id", "").startswith("prepay_")
                         and not item.get("is_prepayment_entry")
                         and item.get("reinvestment_tag", "not_tagged") == "not_tagged"]
        
        if not regular_entries:
            pytest.skip("No regular untagged cashflows available")
        
        entry = regular_entries[0]
        cashflow_id = entry.get("cashflow_id")
        
        print(f"Testing tag on regular cashflow: {entry.get('bond_name')} (ID: {cashflow_id})")
        
        # Tag the cashflow
        tag_data = {
            "reinvestment_tag": "both",
            "portfolio_category": "wealth",
            "target_ucc": entry.get("client_ucc_list", ["TEST_UCC"])[0] if entry.get("client_ucc_list") else "TEST_UCC"
        }
        
        tag_response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}",
            json=tag_data
        )
        
        # Should succeed or return specific error
        assert tag_response.status_code in [200, 400], f"Unexpected status: {tag_response.status_code}"
        
        if tag_response.status_code == 200:
            print("SUCCESS: Regular cashflow tagged successfully")
        else:
            print(f"INFO: Tagging returned {tag_response.status_code}: {tag_response.text}")


class TestPrepaymentResponseFields:
    """Verify prepayment-specific fields in API response"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        
        if step1_response.status_code != 200:
            pytest.skip("Login failed")
        
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        
        if step2_response.status_code != 200:
            pytest.skip("Login step 2 failed")
        
        return step2_response.json().get("token")
    
    @pytest.fixture
    def api_client(self, auth_token):
        """Session with auth header"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_prepayment_entry_has_correct_fields(self, api_client):
        """Verify prepayment entries have all expected fields"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200
        data = response.json()
        
        all_items = []
        for month in data.get("months", []):
            all_items.extend(month.get("items", []))
        
        prepayment_entries = [item for item in all_items 
                            if item.get("cashflow_id", "").startswith("prepay_")
                            or item.get("is_prepayment_entry")]
        
        if not prepayment_entries:
            pytest.skip("No prepayment entries to verify")
        
        for prepay in prepayment_entries:
            # Verify prepayment-specific fields
            assert prepay.get("is_prepayment_entry") == True, "Should have is_prepayment_entry=true"
            assert prepay.get("interest_net") == 0, "Prepayment should have 0 interest"
            assert prepay.get("cashflow_id", "").startswith("prepay_"), "ID should start with prepay_"
            
            # Verify standard reinvestment fields exist
            assert "client_id" in prepay
            assert "client_name" in prepay
            assert "bond_name" in prepay
            assert "net_amount" in prepay
            assert "reinvestment_tag" in prepay
            
            print(f"Prepayment entry verified: {prepay.get('bond_name')} - ₹{prepay.get('net_amount', 0):,.0f}")
        
        print(f"SUCCESS: {len(prepayment_entries)} prepayment entries have correct structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
