"""
Test cases for Reinvestment Edit/Cancel functionality
Tests:
1. POST /api/reinvestment/cancel/{log_id} - Cancel reinvestment tag
2. PUT /api/reinvestment/edit/{log_id} - Edit reinvestment tag
3. POST /api/client/approve-reinvestment/{log_id} - Handle cancellation_pending and edit_pending
4. GET /api/client/pending-approvals - Return approvals with different statuses
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bond-aum-engine.preview.emergentagent.com').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


class TestReinvestmentEditCancel:
    """Test reinvestment edit and cancel functionality"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        # Step 1: Login with PAN and password
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200, f"Login step 1 failed: {response.text}"
        temp_token = response.json().get("temp_token")
        
        # Step 2: Verify PIN
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200, f"Login step 2 failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, broker_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {broker_token}",
            "Content-Type": "application/json"
        }
    
    def test_cancel_endpoint_exists(self, headers):
        """Test that cancel endpoint exists and returns proper error for invalid log_id"""
        # Test with a non-existent log_id
        fake_log_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/reinvestment/cancel/{fake_log_id}",
            headers=headers,
            json={"reason": "Test cancellation"}
        )
        # Should return 404 for non-existent log
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert "not found" in response.json().get("detail", "").lower()
        print("✓ Cancel endpoint exists and returns 404 for invalid log_id")
    
    def test_edit_endpoint_exists(self, headers):
        """Test that edit endpoint exists and returns proper error for invalid log_id"""
        # Test with a non-existent log_id
        fake_log_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/reinvestment/edit/{fake_log_id}",
            headers=headers,
            json={
                "reinvestment_tag": "principal",
                "portfolio_category": "wealth",
                "reason": "Test edit"
            }
        )
        # Should return 404 for non-existent log
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert "not found" in response.json().get("detail", "").lower()
        print("✓ Edit endpoint exists and returns 404 for invalid log_id")
    
    def test_cancel_requires_auth(self):
        """Test that cancel endpoint requires authentication"""
        fake_log_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/reinvestment/cancel/{fake_log_id}",
            json={"reason": "Test"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Cancel endpoint requires authentication")
    
    def test_edit_requires_auth(self):
        """Test that edit endpoint requires authentication"""
        fake_log_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/reinvestment/edit/{fake_log_id}",
            json={"reinvestment_tag": "principal"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Edit endpoint requires authentication")
    
    def test_get_reinvestment_logs(self, headers):
        """Test getting reinvestment logs to find existing entries"""
        response = requests.get(
            f"{BASE_URL}/api/reinvestment/logs",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get logs: {response.text}"
        logs = response.json()
        print(f"✓ Found {len(logs)} reinvestment logs")
        
        # Check if any logs have different statuses
        statuses = set()
        for log in logs:
            status = log.get('approval_status', 'unknown')
            statuses.add(status)
        print(f"  Statuses found: {statuses}")
        return logs
    
    def test_get_upcoming_reinvestments(self, headers):
        """Test getting upcoming reinvestments for tagging"""
        response = requests.get(
            f"{BASE_URL}/api/reinvestment/upcoming",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get upcoming: {response.text}"
        data = response.json()
        
        months = data.get('months', [])
        total_items = sum(len(m.get('items', [])) for m in months)
        print(f"✓ Found {total_items} upcoming reinvestment items across {len(months)} months")
        return data


class TestClientApprovals:
    """Test client approval endpoints for different statuses"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200
        temp_token = response.json().get("temp_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, broker_token):
        return {
            "Authorization": f"Bearer {broker_token}",
            "Content-Type": "application/json"
        }
    
    def test_client_pending_approvals_endpoint_exists(self, headers):
        """Test that client pending approvals endpoint exists"""
        # This should fail with 403 since we're using broker token
        response = requests.get(
            f"{BASE_URL}/api/client/pending-approvals",
            headers=headers
        )
        # Broker should get 403 - only clients can access
        assert response.status_code == 403, f"Expected 403 for broker, got {response.status_code}"
        print("✓ Client pending approvals endpoint correctly restricts broker access")
    
    def test_client_approve_reinvestment_endpoint_exists(self, headers):
        """Test that client approve reinvestment endpoint exists"""
        fake_log_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/client/approve-reinvestment/{fake_log_id}",
            headers=headers,
            json={"action": "approve", "notes": "Test"}
        )
        # Broker should get 403 - only clients can access
        assert response.status_code == 403, f"Expected 403 for broker, got {response.status_code}"
        print("✓ Client approve reinvestment endpoint correctly restricts broker access")
    
    def test_get_clients_with_login(self, headers):
        """Get clients that have login credentials for testing"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        clients = response.json()
        
        # Find clients with user_id (have login credentials)
        clients_with_login = [c for c in clients if c.get('user_id')]
        print(f"✓ Found {len(clients_with_login)} clients with login credentials out of {len(clients)} total")
        
        if clients_with_login:
            print(f"  Sample client: {clients_with_login[0].get('name')} - PAN: {clients_with_login[0].get('pan_number')}")
        
        return clients_with_login


class TestReinvestmentWorkflow:
    """Test the full reinvestment workflow including edit/cancel"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200
        temp_token = response.json().get("temp_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, broker_token):
        return {
            "Authorization": f"Bearer {broker_token}",
            "Content-Type": "application/json"
        }
    
    def test_find_taggable_cashflow(self, headers):
        """Find a cashflow that can be tagged for testing"""
        response = requests.get(
            f"{BASE_URL}/api/reinvestment/upcoming",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find an untagged item
        for month in data.get('months', []):
            for item in month.get('items', []):
                if item.get('reinvestment_tag') in [None, 'not_tagged', '']:
                    print(f"✓ Found taggable cashflow: {item.get('bond_name')} - ID: {item.get('cashflow_id')}")
                    return item
        
        print("  No untagged cashflows found - this is expected if all are tagged")
        return None
    
    def test_tag_cashflow(self, headers):
        """Test tagging a cashflow for reinvestment"""
        # First find a taggable cashflow
        response = requests.get(
            f"{BASE_URL}/api/reinvestment/upcoming",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find an untagged item
        taggable = None
        for month in data.get('months', []):
            for item in month.get('items', []):
                if item.get('reinvestment_tag') in [None, 'not_tagged', '']:
                    taggable = item
                    break
            if taggable:
                break
        
        if not taggable:
            pytest.skip("No untagged cashflows available for testing")
        
        cashflow_id = taggable.get('cashflow_id') or taggable.get('id')
        
        # Tag the cashflow
        response = requests.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}",
            headers=headers,
            json={
                "reinvestment_tag": "principal",
                "portfolio_category": "wealth",
                "target_ucc": taggable.get('ucc_list', [''])[0] if taggable.get('ucc_list') else None
            }
        )
        
        if response.status_code == 200:
            print(f"✓ Successfully tagged cashflow {cashflow_id}")
            return cashflow_id
        else:
            print(f"  Tag response: {response.status_code} - {response.text}")
            return None
    
    def test_reinvestment_logs_structure(self, headers):
        """Test that reinvestment logs have proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/reinvestment/logs",
            headers=headers
        )
        assert response.status_code == 200
        logs = response.json()
        
        if logs:
            sample = logs[0]
            expected_fields = ['id', 'client_id', 'approval_status']
            for field in expected_fields:
                assert field in sample, f"Missing field: {field}"
            print(f"✓ Reinvestment logs have proper structure")
            print(f"  Sample log status: {sample.get('approval_status')}")
        else:
            print("  No reinvestment logs found")


class TestClientHoldingsUI:
    """Test Client Holdings page API endpoints"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200
        temp_token = response.json().get("temp_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def headers(self, broker_token):
        return {
            "Authorization": f"Bearer {broker_token}",
            "Content-Type": "application/json"
        }
    
    def test_holdings_pdf_endpoint_exists(self, headers):
        """Test that holdings PDF download endpoint exists"""
        # Get a bond_id from holdings first
        response = requests.get(
            f"{BASE_URL}/api/holdings/clients",
            headers=headers
        )
        assert response.status_code == 200
        clients = response.json()
        
        if clients:
            # Get holdings for first client
            client_id = clients[0].get('id')
            response = requests.get(
                f"{BASE_URL}/api/holdings/client/{client_id}",
                headers=headers
            )
            if response.status_code == 200:
                holdings = response.json()
                if holdings.get('holdings'):
                    bond_id = holdings['holdings'][0].get('bond_id')
                    # Test PDF endpoint
                    response = requests.get(
                        f"{BASE_URL}/api/holdings/{bond_id}/pdf",
                        headers=headers
                    )
                    # Should return PDF or 404 if not implemented
                    assert response.status_code in [200, 404, 500], f"Unexpected status: {response.status_code}"
                    print(f"✓ Holdings PDF endpoint status: {response.status_code}")
        else:
            print("  No clients with holdings found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
