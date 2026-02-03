"""
Test suite for Email Engagement Dashboard Feature
Tests: 
- Dashboard API with summary and logs
- Clients listing API  
- Manual tagging API
- All related endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_BROKER_PAN = "ANVPB5297J"
TEST_BROKER_PASSWORD = "Laksh@0208"
TEST_BROKER_PIN = "0516"


@pytest.fixture(scope="module")
def broker_token():
    """Get broker authentication token"""
    # Step 1: Login with PAN and password
    step1_response = requests.post(
        f"{BASE_URL}/api/auth/login-step1",
        json={"pan": TEST_BROKER_PAN, "password": TEST_BROKER_PASSWORD}
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
        pytest.skip(f"Login step 2 failed: {step2_response.status_code} - {step2_response.text}")
    
    token = step2_response.json().get("token")
    return token


class TestEmailEngagementDashboard:
    """Tests for Email Engagement Dashboard API endpoints"""
    
    def test_dashboard_endpoint_returns_200(self, broker_token):
        """Test GET /api/email-engagement/dashboard returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "summary" in data, "Response should contain 'summary' field"
        assert "logs" in data, "Response should contain 'logs' field"
    
    def test_dashboard_summary_structure(self, broker_token):
        """Test dashboard summary has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        summary = response.json().get("summary", {})
        
        # Verify all expected summary fields exist
        expected_fields = [
            "total_emails_read",
            "clients_identified", 
            "holdings_updated",
            "holdings_pending",
            "total_gross_amount",
            "total_net_amount",
            "total_tds"
        ]
        
        for field in expected_fields:
            assert field in summary, f"Summary should contain '{field}' field"
        
        # Verify values are numbers
        assert isinstance(summary["total_emails_read"], int), "total_emails_read should be int"
        assert isinstance(summary["holdings_updated"], int), "holdings_updated should be int"
        assert isinstance(summary["holdings_pending"], int), "holdings_pending should be int"
    
    def test_dashboard_with_date_filters(self, broker_token):
        """Test dashboard with date filters"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            params={
                "date_from": "2024-01-01",
                "date_to": "2025-12-31"
            },
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "summary" in data
        assert "logs" in data
    
    def test_dashboard_with_holding_status_filter(self, broker_token):
        """Test dashboard with holding status filter"""
        # Test updated status
        response_updated = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            params={"holding_status": "updated"},
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response_updated.status_code == 200
        
        # Test pending status
        response_pending = requests.get(
            f"{BASE_URL}/api/email-engagement/dashboard",
            params={"holding_status": "pending"},
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response_pending.status_code == 200


class TestEmailEngagementClients:
    """Tests for Email Engagement Clients API"""
    
    def test_clients_endpoint_returns_200(self, broker_token):
        """Test GET /api/email-engagement/clients returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/clients",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "clients" in data, "Response should contain 'clients' field"
        assert isinstance(data["clients"], list), "clients should be a list"
    
    def test_clients_structure(self, broker_token):
        """Test clients list has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/clients",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        clients = response.json().get("clients", [])
        
        # If there are clients, verify structure
        if clients:
            client = clients[0]
            assert "id" in client, "Client should have 'id' field"
            assert "name" in client, "Client should have 'name' field"
            assert "email_count" in client, "Client should have 'email_count' field"


class TestEmailEngagementSummary:
    """Tests for Email Engagement Summary API"""
    
    def test_summary_endpoint_returns_200(self, broker_token):
        """Test GET /api/email-engagement/summary returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/summary",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_summary_structure(self, broker_token):
        """Test summary has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/summary",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        expected_fields = [
            "total_emails_read",
            "clients_identified",
            "holdings_updated", 
            "holdings_pending",
            "total_gross_amount",
            "total_net_amount",
            "total_tds"
        ]
        
        for field in expected_fields:
            assert field in data, f"Summary should contain '{field}' field"


class TestEmailEngagementUntagged:
    """Tests for Untagged Email Logs API"""
    
    def test_untagged_endpoint_returns_200(self, broker_token):
        """Test GET /api/email-engagement/untagged returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/email-engagement/untagged",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "logs" in data, "Response should contain 'logs' field"
        assert isinstance(data["logs"], list), "logs should be a list"


class TestClientsAndBondsEndpoints:
    """Tests for supporting endpoints needed by tagging modal"""
    
    def test_clients_list_returns_200(self, broker_token):
        """Test GET /api/clients returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of clients"
    
    def test_bonds_list_returns_200(self, broker_token):
        """Test GET /api/bonds returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/bonds",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of bonds"


class TestManualTaggingAPI:
    """Tests for Manual Tagging API"""
    
    def test_manual_tag_requires_all_fields(self, broker_token):
        """Test POST /api/email-engagement/manual-tag validates required fields"""
        # Test with missing fields
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/manual-tag",
            json={
                "email_log_id": "test-id"
                # Missing client_id, bond_id, repayment_date
            },
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Should return 422 (validation error) for missing fields
        assert response.status_code == 422, f"Expected 422 for missing fields, got {response.status_code}"
    
    def test_manual_tag_with_invalid_email_log_id(self, broker_token):
        """Test POST /api/email-engagement/manual-tag with invalid email log ID"""
        response = requests.post(
            f"{BASE_URL}/api/email-engagement/manual-tag",
            json={
                "email_log_id": "invalid-id-does-not-exist",
                "client_id": "some-client-id",
                "bond_id": "some-bond-id", 
                "repayment_date": "2025-01-15"
            },
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Should return 404 for non-existent email log
        assert response.status_code == 404, f"Expected 404 for invalid email log, got {response.status_code}"


class TestAuthorizationRestrictions:
    """Tests for authorization - only brokers should access these endpoints"""
    
    def test_dashboard_requires_auth(self):
        """Test dashboard endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/email-engagement/dashboard")
        # Should return 403 or 401 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_clients_requires_auth(self):
        """Test clients endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/email-engagement/clients")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_summary_requires_auth(self):
        """Test summary endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/email-engagement/summary")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
