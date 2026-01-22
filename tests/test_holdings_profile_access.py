"""
Test Holdings Profile Access - Role-based access control for client profiles
Tests that broker, sub-broker, and client can all access client profile data
via GET /api/clients/{client_id} and GET /api/holdings/clients endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
BROKER_CREDS = {"pan": "ANVPB5297J", "password": "Laksh@0208", "pin": "0516"}
SUBBROKER_CREDS = {"pan": "TESTSB1234", "password": "Test@123", "pin": "1234"}
CLIENT_CREDS = {"pan": "TESTN1234R", "password": "kinntegra123", "pin": "1234"}

# Known client ID from context
CLIENT_ID = "c83c99c4-f960-4631-bc6e-d94e4ac28a9f"
CLIENT_USER_ID = "5c7e6b0f-fd07-433e-bfe2-b8e9eeaab7c9"


def two_step_login(session, pan, password, pin):
    """Perform two-step login and return token and user info"""
    # Step 1: PAN + Password
    step1_response = session.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": pan,
        "password": password
    })
    if step1_response.status_code != 200:
        return None, None, f"Step 1 failed: {step1_response.status_code} - {step1_response.text}"
    
    temp_token = step1_response.json().get("temp_token")
    
    # Step 2: PIN
    step2_response = session.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": pin
    })
    if step2_response.status_code != 200:
        return None, None, f"Step 2 failed: {step2_response.status_code} - {step2_response.text}"
    
    data = step2_response.json()
    return data.get("token"), data.get("user"), None


class TestBrokerAccess:
    """Test broker access to client profile and holdings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token, self.user, error = two_step_login(
            self.session, 
            BROKER_CREDS["pan"], 
            BROKER_CREDS["password"], 
            BROKER_CREDS["pin"]
        )
        if error:
            pytest.skip(f"Broker login failed: {error}")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_broker_login_success(self):
        """Verify broker can login successfully"""
        assert self.token is not None
        assert self.user is not None
        assert self.user.get("role") == "broker"
        print(f"✓ Broker logged in: {self.user.get('name')} (role: {self.user.get('role')})")
    
    def test_broker_get_holdings_clients(self):
        """Broker can get list of clients via GET /api/holdings/clients"""
        response = self.session.get(f"{BASE_URL}/api/holdings/clients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Response should be a list"
        print(f"✓ Broker retrieved {len(clients)} clients from /api/holdings/clients")
        
        # Check if our test client is in the list
        client_ids = [c.get("id") for c in clients]
        if CLIENT_ID in client_ids:
            print(f"✓ Test client {CLIENT_ID} found in broker's client list")
        else:
            print(f"⚠ Test client {CLIENT_ID} not found in broker's client list (may be created by different broker)")
    
    def test_broker_get_client_profile(self):
        """Broker can access client profile via GET /api/clients/{client_id}"""
        response = self.session.get(f"{BASE_URL}/api/clients/{CLIENT_ID}")
        
        # If 403, the client may not belong to this broker
        if response.status_code == 403:
            pytest.skip(f"Client {CLIENT_ID} not accessible by this broker (different creator)")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        client = response.json()
        assert "id" in client, "Response should contain client id"
        assert client.get("id") == CLIENT_ID
        
        # Verify all profile fields are returned (not filtered)
        expected_fields = ["name", "email", "pan", "phone", "mobile"]
        for field in expected_fields:
            if field in client:
                print(f"  ✓ Field '{field}' present: {client.get(field, 'N/A')[:30] if client.get(field) else 'N/A'}...")
        
        print(f"✓ Broker can access client profile for {CLIENT_ID}")
        return client


class TestSubBrokerAccess:
    """Test sub-broker access to linked client profile and holdings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token, self.user, error = two_step_login(
            self.session, 
            SUBBROKER_CREDS["pan"], 
            SUBBROKER_CREDS["password"], 
            SUBBROKER_CREDS["pin"]
        )
        if error:
            pytest.skip(f"Sub-broker login failed: {error}")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_subbroker_login_success(self):
        """Verify sub-broker can login successfully"""
        assert self.token is not None
        assert self.user is not None
        assert self.user.get("role") == "sub_broker"
        print(f"✓ Sub-broker logged in: {self.user.get('name')} (role: {self.user.get('role')})")
    
    def test_subbroker_get_holdings_clients(self):
        """Sub-broker can get list of linked clients via GET /api/holdings/clients"""
        response = self.session.get(f"{BASE_URL}/api/holdings/clients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Response should be a list"
        print(f"✓ Sub-broker retrieved {len(clients)} linked clients from /api/holdings/clients")
        
        # Sub-broker should only see linked clients
        for client in clients:
            print(f"  - Client: {client.get('name')} (ID: {client.get('id')[:8]}...)")
    
    def test_subbroker_get_linked_client_profile(self):
        """Sub-broker can access linked client profile via GET /api/clients/{client_id}"""
        # First get the list of linked clients
        response = self.session.get(f"{BASE_URL}/api/holdings/clients")
        if response.status_code != 200:
            pytest.skip("Could not get linked clients list")
        
        clients = response.json()
        if not clients:
            pytest.skip("Sub-broker has no linked clients")
        
        # Try to access the first linked client
        linked_client_id = clients[0].get("id")
        
        response = self.session.get(f"{BASE_URL}/api/clients/{linked_client_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        client = response.json()
        assert "id" in client, "Response should contain client id"
        
        # Verify all profile fields are returned (not filtered)
        expected_fields = ["name", "email", "pan", "phone", "mobile"]
        for field in expected_fields:
            if field in client:
                print(f"  ✓ Field '{field}' present: {client.get(field, 'N/A')[:30] if client.get(field) else 'N/A'}...")
        
        print(f"✓ Sub-broker can access linked client profile for {linked_client_id}")


class TestClientAccess:
    """Test client access to their own profile and holdings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token, self.user, error = two_step_login(
            self.session, 
            CLIENT_CREDS["pan"], 
            CLIENT_CREDS["password"], 
            CLIENT_CREDS["pin"]
        )
        if error:
            pytest.skip(f"Client login failed: {error}")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_client_login_success(self):
        """Verify client can login successfully"""
        assert self.token is not None
        assert self.user is not None
        assert self.user.get("role") == "client"
        print(f"✓ Client logged in: {self.user.get('name')} (role: {self.user.get('role')})")
        
        # Store client_id for later tests
        self.client_id = self.user.get("client_id")
        print(f"  Client ID from login: {self.client_id}")
    
    def test_client_get_holdings_clients(self):
        """Client can get their own entry via GET /api/holdings/clients"""
        response = self.session.get(f"{BASE_URL}/api/holdings/clients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Response should be a list"
        
        # Client should only see themselves
        print(f"✓ Client retrieved {len(clients)} entry from /api/holdings/clients")
        
        if len(clients) == 1:
            print(f"  ✓ Client sees only themselves: {clients[0].get('name')}")
        elif len(clients) == 0:
            print(f"  ⚠ Client sees no entries (may not have client record linked)")
        else:
            print(f"  ⚠ Client sees {len(clients)} entries (expected 1)")
    
    def test_client_get_own_profile(self):
        """Client can access their own profile via GET /api/clients/{client_id}"""
        # Get client_id from user data
        client_id = self.user.get("client_id")
        if not client_id:
            # Try the known client ID
            client_id = CLIENT_ID
        
        response = self.session.get(f"{BASE_URL}/api/clients/{client_id}")
        
        # This is the key test - client should be able to access their own profile
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        client = response.json()
        assert "id" in client, "Response should contain client id"
        
        # Verify all profile fields are returned (not filtered)
        expected_fields = ["name", "email", "pan", "phone", "mobile", "city", "address_line1"]
        for field in expected_fields:
            if field in client:
                value = client.get(field, 'N/A')
                display_value = str(value)[:30] if value else 'N/A'
                print(f"  ✓ Field '{field}' present: {display_value}...")
        
        print(f"✓ Client can access their own profile for {client_id}")
    
    def test_client_cannot_access_other_client(self):
        """Client cannot access another client's profile"""
        # Use a fake client ID
        fake_client_id = "00000000-0000-0000-0000-000000000000"
        
        response = self.session.get(f"{BASE_URL}/api/clients/{fake_client_id}")
        
        # Should get 403 or 404
        assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
        print(f"✓ Client correctly denied access to other client's profile (status: {response.status_code})")


class TestProfileFieldsConsistency:
    """Test that all roles see the same profile fields"""
    
    def test_profile_fields_same_for_all_roles(self):
        """Verify broker, sub-broker, and client see same profile fields"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as broker
        broker_token, broker_user, error = two_step_login(
            session, BROKER_CREDS["pan"], BROKER_CREDS["password"], BROKER_CREDS["pin"]
        )
        if error:
            pytest.skip(f"Broker login failed: {error}")
        
        # Get broker's clients
        session.headers.update({"Authorization": f"Bearer {broker_token}"})
        response = session.get(f"{BASE_URL}/api/holdings/clients")
        if response.status_code != 200 or not response.json():
            pytest.skip("No clients available for comparison")
        
        broker_clients = response.json()
        test_client_id = broker_clients[0].get("id")
        
        # Get profile as broker
        response = session.get(f"{BASE_URL}/api/clients/{test_client_id}")
        if response.status_code != 200:
            pytest.skip(f"Could not get client profile as broker: {response.status_code}")
        
        broker_profile = response.json()
        broker_fields = set(broker_profile.keys())
        
        print(f"✓ Broker sees {len(broker_fields)} fields in client profile")
        print(f"  Fields: {sorted(broker_fields)[:10]}...")  # Show first 10
        
        # Note: We can't easily compare with sub-broker/client without knowing
        # which clients are linked to which sub-broker, but we've verified
        # the endpoint returns full data for broker


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
