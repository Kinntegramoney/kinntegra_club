"""
Test suite for Lead Management API endpoints
Tests: POST /api/leads, GET /api/leads, PUT /api/leads/{lead_id}/status
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_CREDS = {"pan": "ANVPB5297J", "password": "Laksh@0208", "pin": "0516"}
SUB_BROKER_CREDS = {"pan": "AKQPR6699J", "password": "kinntegra123", "pin": "1234"}
CLIENT_CREDS = {"pan": "AJMPD3987G", "password": "kinntegra123", "pin": "1234"}


def get_auth_token(pan: str, password: str, pin: str) -> str:
    """Helper to get auth token via 2-step login"""
    # Step 1: PAN + Password
    step1_response = requests.post(
        f"{BASE_URL}/api/auth/login-step1",
        json={"pan": pan, "password": password}
    )
    if step1_response.status_code != 200:
        return None
    
    temp_token = step1_response.json().get("temp_token")
    
    # Step 2: PIN verification
    step2_response = requests.post(
        f"{BASE_URL}/api/auth/login-step2",
        json={"temp_token": temp_token, "pin": pin}
    )
    if step2_response.status_code != 200:
        return None
    
    return step2_response.json().get("token")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint working")


class TestAuthentication:
    """Test authentication flow"""
    
    def test_broker_login(self):
        """Test broker can login successfully"""
        token = get_auth_token(**BROKER_CREDS)
        assert token is not None, "Broker login failed"
        print(f"✓ Broker login successful, token: {token[:20]}...")
    
    def test_sub_broker_login(self):
        """Test sub-broker can login successfully"""
        token = get_auth_token(**SUB_BROKER_CREDS)
        assert token is not None, "Sub-broker login failed"
        print(f"✓ Sub-broker login successful, token: {token[:20]}...")
    
    def test_client_login(self):
        """Test client can login successfully"""
        token = get_auth_token(**CLIENT_CREDS)
        assert token is not None, "Client login failed"
        print(f"✓ Client login successful, token: {token[:20]}...")


class TestLeadsAPI:
    """Test Lead Management API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for tests"""
        self.broker_token = get_auth_token(**BROKER_CREDS)
        self.sub_broker_token = get_auth_token(**SUB_BROKER_CREDS)
        self.client_token = get_auth_token(**CLIENT_CREDS)
    
    def test_get_leads_broker(self):
        """Test broker can get leads list"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Broker can access leads - found {len(data)} leads")
    
    def test_get_leads_sub_broker(self):
        """Test sub-broker can get leads list"""
        if not self.sub_broker_token:
            pytest.skip("Sub-broker authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={"Authorization": f"Bearer {self.sub_broker_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Sub-broker can access leads - found {len(data)} leads")
    
    def test_get_leads_client_forbidden(self):
        """Test client cannot access leads list"""
        if not self.client_token:
            pytest.skip("Client authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={"Authorization": f"Bearer {self.client_token}"}
        )
        assert response.status_code == 403
        print("✓ Client correctly forbidden from accessing leads")
    
    def test_create_lead_requires_auth(self):
        """Test creating lead requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/leads",
            json={
                "opportunity_type": "bond",
                "opportunity_id": "test-id",
                "investment_amount": 100000
            }
        )
        assert response.status_code in [401, 403]
        print("✓ Create lead requires authentication")
    
    def test_update_lead_status_invalid_status(self):
        """Test updating lead with invalid status fails"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        # Try to update with invalid status
        response = requests.put(
            f"{BASE_URL}/api/leads/nonexistent-id/status",
            json={"status": "invalid_status"},
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        # Should fail with 400 (invalid status) or 404 (lead not found)
        assert response.status_code in [400, 404]
        print("✓ Invalid status correctly rejected")
    
    def test_update_lead_status_not_found(self):
        """Test updating non-existent lead returns 404"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        response = requests.put(
            f"{BASE_URL}/api/leads/nonexistent-lead-id/status",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        assert response.status_code == 404
        print("✓ Non-existent lead returns 404")
    
    def test_client_cannot_update_lead(self):
        """Test client cannot update lead status"""
        if not self.client_token:
            pytest.skip("Client authentication failed")
        
        response = requests.put(
            f"{BASE_URL}/api/leads/any-lead-id/status",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {self.client_token}"}
        )
        assert response.status_code == 403
        print("✓ Client correctly forbidden from updating leads")


class TestBondsAPI:
    """Test Bonds API for opportunities"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for tests"""
        self.broker_token = get_auth_token(**BROKER_CREDS)
    
    def test_get_bonds(self):
        """Test getting bonds list"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/bonds",
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Handle both array and paginated response
        bonds = data.get('data', data) if isinstance(data, dict) else data
        print(f"✓ Bonds API working - found {len(bonds)} bonds")


class TestRealEstateAPI:
    """Test Real Estate API for opportunities"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for tests"""
        self.broker_token = get_auth_token(**BROKER_CREDS)
    
    def test_get_real_estate_opportunities(self):
        """Test getting real estate opportunities list"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/real-estate-opportunities",
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Handle both array and paginated response
        opportunities = data.get('data', data) if isinstance(data, dict) else data
        print(f"✓ Real Estate API working - found {len(opportunities)} opportunities")


class TestTradesAPI:
    """Test Trades API for logs page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for tests"""
        self.broker_token = get_auth_token(**BROKER_CREDS)
    
    def test_get_all_trades(self):
        """Test getting all trades for logs"""
        if not self.broker_token:
            pytest.skip("Broker authentication failed")
        
        response = requests.get(
            f"{BASE_URL}/api/trades/all",
            headers={"Authorization": f"Bearer {self.broker_token}"}
        )
        # May return 200 with data or 404 if no trades
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Trades API working - found {len(data)} trades")
        else:
            print("✓ Trades API accessible (no trades found)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
