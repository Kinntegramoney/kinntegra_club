"""
Client Portal API Tests
Tests for:
- Client user creation when broker creates a client
- Client profile verification endpoint
- Client login with PAN + Password + PIN
- Client Opportunities page shows available bonds
- Client Profile page shows broker details
- Client Holdings page
- Client Trade Verification page with reinvestment approval
- Client can book units for themselves (via bond details page)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketworth-ui.preview.emergentagent.com').rstrip('/')

# Test credentials
BROKER_CREDS = {"pan": "ABCDE1234F", "password": "broker123", "pin": "1234"}
CLIENT_CREDS = {"pan": "TESTCP1234", "password": "12341234", "pin": "1234"}


class TestClientPortalAuth:
    """Test client authentication flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_client_login_step1_success(self):
        """Test client login step 1 - PAN + Password"""
        response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        assert response.status_code == 200, f"Login step 1 failed: {response.text}"
        data = response.json()
        assert "temp_token" in data
        assert len(data["temp_token"]) > 0
        print(f"✓ Client login step 1 successful - temp_token received")
    
    def test_client_login_step2_success(self):
        """Test client login step 2 - PIN verification"""
        # First get temp token
        step1_response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        assert step1_response.status_code == 200
        temp_token = step1_response.json()["temp_token"]
        
        # Then verify PIN
        response = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        assert response.status_code == 200, f"Login step 2 failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "client"
        assert data["user"]["pan"] == CLIENT_CREDS["pan"]
        assert "client_id" in data["user"]
        print(f"✓ Client login step 2 successful - role: {data['user']['role']}")
    
    def test_client_login_invalid_pan(self):
        """Test client login with invalid PAN"""
        response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": "INVALID1234",
            "password": CLIENT_CREDS["password"]
        })
        assert response.status_code == 401
        print("✓ Invalid PAN correctly rejected")
    
    def test_client_login_invalid_password(self):
        """Test client login with invalid password"""
        response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid password correctly rejected")
    
    def test_client_login_invalid_pin(self):
        """Test client login with invalid PIN"""
        # First get temp token
        step1_response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1_response.json()["temp_token"]
        
        # Then try invalid PIN
        response = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": "9999"
        })
        assert response.status_code == 401
        print("✓ Invalid PIN correctly rejected")


class TestClientProfile:
    """Test client profile endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.user = step2.json()["user"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_client_profile(self):
        """Test getting client's own profile"""
        response = self.session.get(f"{BASE_URL}/api/client/profile")
        assert response.status_code == 200, f"Get profile failed: {response.text}"
        data = response.json()
        
        # Verify client data
        assert "client" in data
        assert data["client"]["pan_number"] == CLIENT_CREDS["pan"]
        assert data["client"]["verification_status"] == "verified"
        
        # Verify broker data
        assert "broker" in data
        assert data["broker"] is not None
        assert "name" in data["broker"]
        
        print(f"✓ Client profile retrieved - Name: {data['client']['name']}")
        print(f"  Broker: {data['broker']['name']}")
    
    def test_client_profile_forbidden_for_broker(self):
        """Test that broker cannot access client profile endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.get(
            f"{BASE_URL}/api/client/profile",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client profile endpoint")


class TestClientOpportunities:
    """Test client opportunities (available bonds) endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_client_opportunities(self):
        """Test getting available bonds for client"""
        response = self.session.get(f"{BASE_URL}/api/client/opportunities")
        assert response.status_code == 200, f"Get opportunities failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Client opportunities retrieved - {len(data)} bonds available")
        
        # If bonds exist, verify structure
        if len(data) > 0:
            bond = data[0]
            assert "id" in bond
            assert "name" in bond
            assert "status" in bond
            assert bond["status"] == "available"
            assert "units_remaining" in bond
            print(f"  First bond: {bond['name']} - {bond['units_remaining']} units remaining")
    
    def test_client_opportunities_forbidden_for_broker(self):
        """Test that broker cannot access client opportunities endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.get(
            f"{BASE_URL}/api/client/opportunities",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client opportunities endpoint")


class TestClientHoldings:
    """Test client holdings endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_client_holdings(self):
        """Test getting client's own holdings"""
        response = self.session.get(f"{BASE_URL}/api/client/holdings")
        assert response.status_code == 200, f"Get holdings failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "client" in data
        assert "summary" in data
        assert "holdings" in data
        
        # Verify summary fields
        assert "total_investment" in data["summary"]
        assert "total_repaid" in data["summary"]
        assert "total_upcoming" in data["summary"]
        
        print(f"✓ Client holdings retrieved")
        print(f"  Total Investment: ₹{data['summary']['total_investment']}")
        print(f"  Holdings count: {len(data['holdings'])}")
    
    def test_client_holdings_forbidden_for_broker(self):
        """Test that broker cannot access client holdings endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.get(
            f"{BASE_URL}/api/client/holdings",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client holdings endpoint")


class TestClientTrades:
    """Test client trades endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_client_trades(self):
        """Test getting client's own trades"""
        response = self.session.get(f"{BASE_URL}/api/client/trades")
        assert response.status_code == 200, f"Get trades failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Client trades retrieved - {len(data)} trades found")
        
        # If trades exist, verify structure
        if len(data) > 0:
            trade = data[0]
            assert "id" in trade
            assert "bond_name" in trade
            assert "status" in trade
            print(f"  First trade: {trade['bond_name']} - Status: {trade['status']}")
    
    def test_client_trades_forbidden_for_broker(self):
        """Test that broker cannot access client trades endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.get(
            f"{BASE_URL}/api/client/trades",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client trades endpoint")


class TestClientReinvestment:
    """Test client reinvestment approval endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_client_reinvestment(self):
        """Test getting client's reinvestment tags"""
        response = self.session.get(f"{BASE_URL}/api/client/reinvestment")
        assert response.status_code == 200, f"Get reinvestment failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "pending" in data
        assert "approved" in data
        assert "rejected" in data
        
        assert isinstance(data["pending"], list)
        assert isinstance(data["approved"], list)
        assert isinstance(data["rejected"], list)
        
        print(f"✓ Client reinvestment tags retrieved")
        print(f"  Pending: {len(data['pending'])}, Approved: {len(data['approved'])}, Rejected: {len(data['rejected'])}")
    
    def test_client_reinvestment_forbidden_for_broker(self):
        """Test that broker cannot access client reinvestment endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.get(
            f"{BASE_URL}/api/client/reinvestment",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client reinvestment endpoint")


class TestClientCreationByBroker:
    """Test client user creation when broker creates a client"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_broker_creates_client_with_user_account(self):
        """Test that broker creating a client also creates a user account"""
        unique_pan = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        response = self.session.post(f"{BASE_URL}/api/clients", json={
            "name": "Test Portal Client",
            "pan_number": unique_pan,
            "email": f"test_{unique_pan.lower()}@example.com",
            "mobile": "9876543210"
        })
        
        assert response.status_code == 200, f"Create client failed: {response.text}"
        data = response.json()
        
        # Verify client data
        assert "id" in data
        assert "user_id" in data
        assert "verification_token" in data
        assert data["verification_status"] == "pending"
        
        # Verify default credentials are returned
        assert "default_password" in data
        assert "default_pin" in data
        assert data["default_pin"] == "1234"
        
        print(f"✓ Client created with user account")
        print(f"  Client ID: {data['id']}")
        print(f"  User ID: {data['user_id']}")
        print(f"  Default Password: {data['default_password']}")
        
        # Cleanup - delete the test client
        self.session.delete(f"{BASE_URL}/api/clients/{data['id']}")


class TestClientProfileVerification:
    """Test client profile verification endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_verification_details(self):
        """Test getting client verification details by token"""
        # First create a new client
        unique_pan = f"VERIF{uuid.uuid4().hex[:5].upper()}"
        
        create_response = self.session.post(f"{BASE_URL}/api/clients", json={
            "name": "Verification Test Client",
            "pan_number": unique_pan,
            "email": f"verify_{unique_pan.lower()}@example.com",
            "mobile": "9876543210"
        })
        
        assert create_response.status_code == 200
        client_data = create_response.json()
        verification_token = client_data["verification_token"]
        
        # Get verification details (no auth required)
        verify_response = requests.get(f"{BASE_URL}/api/client/verify/{verification_token}")
        assert verify_response.status_code == 200, f"Get verification failed: {verify_response.text}"
        
        data = verify_response.json()
        assert "client" in data
        assert "broker" in data
        assert data["client"]["pan_number"] == unique_pan
        
        print(f"✓ Verification details retrieved for token")
        print(f"  Client: {data['client']['name']}")
        print(f"  Broker: {data['broker']['name']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/clients/{client_data['id']}")
    
    def test_verify_client_profile(self):
        """Test client profile verification"""
        # First create a new client
        unique_pan = f"VTEST{uuid.uuid4().hex[:5].upper()}"
        
        create_response = self.session.post(f"{BASE_URL}/api/clients", json={
            "name": "Verify Test Client",
            "pan_number": unique_pan,
            "email": f"vtest_{unique_pan.lower()}@example.com",
            "mobile": "9876543210"
        })
        
        assert create_response.status_code == 200
        client_data = create_response.json()
        verification_token = client_data["verification_token"]
        
        # Verify the profile (no auth required)
        verify_response = requests.post(
            f"{BASE_URL}/api/client/verify/{verification_token}",
            json={"verified": True}
        )
        assert verify_response.status_code == 200, f"Verification failed: {verify_response.text}"
        
        data = verify_response.json()
        assert "message" in data
        assert "credentials" in data
        assert data["credentials"]["pan"] == unique_pan
        
        print(f"✓ Client profile verified successfully")
        print(f"  Credentials returned for first login")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/clients/{client_data['id']}")
    
    def test_invalid_verification_token(self):
        """Test verification with invalid token"""
        response = requests.get(f"{BASE_URL}/api/client/verify/invalid-token-12345")
        assert response.status_code == 404
        print("✓ Invalid verification token correctly rejected")


class TestClientBookUnits:
    """Test client booking units for themselves"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as client
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": CLIENT_CREDS["pan"],
            "password": CLIENT_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": CLIENT_CREDS["pin"]
        })
        self.token = step2.json()["token"]
        self.user = step2.json()["user"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_client_book_units(self):
        """Test client booking units for themselves"""
        # First get available bonds
        bonds_response = self.session.get(f"{BASE_URL}/api/client/opportunities")
        assert bonds_response.status_code == 200
        bonds = bonds_response.json()
        
        if len(bonds) == 0:
            pytest.skip("No available bonds to test booking")
        
        bond = bonds[0]
        
        # Book units
        response = self.session.post(f"{BASE_URL}/api/client/trades", json={
            "bond_id": bond["id"],
            "units": 1,
            "investment_date": "2025-01-15",
            "calculated_price": 100000,
            "total_amount": 100000,
            "payment_reference": "TEST_REF_001"
        })
        
        assert response.status_code == 200, f"Book units failed: {response.text}"
        data = response.json()
        
        # Verify trade data
        assert "id" in data
        assert data["status"] == "pending"  # Client trades require approval
        assert data["created_by_role"] == "client"
        
        print(f"✓ Client booked units successfully")
        print(f"  Trade ID: {data['id']}")
        print(f"  Status: {data['status']} (pending approval)")
    
    def test_client_book_units_invalid_bond(self):
        """Test client booking units for invalid bond"""
        response = self.session.post(f"{BASE_URL}/api/client/trades", json={
            "bond_id": "invalid-bond-id",
            "units": 1,
            "investment_date": "2025-01-15",
            "calculated_price": 100000,
            "total_amount": 100000
        })
        
        assert response.status_code == 404
        print("✓ Invalid bond correctly rejected")
    
    def test_client_book_units_forbidden_for_broker(self):
        """Test that broker cannot use client trades endpoint"""
        # Login as broker
        step1 = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDS["pan"],
            "password": BROKER_CREDS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDS["pin"]
        })
        broker_token = step2.json()["token"]
        
        response = self.session.post(
            f"{BASE_URL}/api/client/trades",
            headers={"Authorization": f"Bearer {broker_token}"},
            json={
                "bond_id": "some-bond-id",
                "units": 1,
                "investment_date": "2025-01-15",
                "calculated_price": 100000,
                "total_amount": 100000
            }
        )
        assert response.status_code == 403
        print("✓ Broker correctly forbidden from client trades endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
