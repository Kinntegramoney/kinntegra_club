"""
Test suite for Reinvestment Tagging feature
Tests:
1. GET /api/reinvestment/upcoming - returns bond_code field
2. PUT /api/reinvestment/tag/{cashflow_id} - tag and untag functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for broker"""
    # Step 1: Login with PAN and password
    response = requests.post(
        f"{BASE_URL}/api/auth/login-step1",
        json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
    )
    assert response.status_code == 200, f"Login step 1 failed: {response.text}"
    temp_token = response.json().get("temp_token")
    
    # Step 2: Verify PIN
    response = requests.post(
        f"{BASE_URL}/api/auth/login-step2",
        json={"temp_token": temp_token, "pin": BROKER_PIN}
    )
    assert response.status_code == 200, f"Login step 2 failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestReinvestmentUpcoming:
    """Tests for GET /api/reinvestment/upcoming endpoint"""
    
    def test_get_upcoming_returns_200(self, api_client):
        """Test that endpoint returns 200 OK"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_response_structure(self, api_client):
        """Test that response has correct structure"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        assert "months" in data, "Response should have 'months' field"
        assert "by_client" in data, "Response should have 'by_client' field"
        assert "total_upcoming" in data, "Response should have 'total_upcoming' field"
    
    def test_cashflow_entry_has_bond_code(self, api_client):
        """Test that each cashflow entry has bond_code field (Deal ID)"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        # Check in months structure
        for month in data.get("months", []):
            for item in month.get("items", []):
                assert "bond_code" in item, f"Cashflow entry should have 'bond_code' field: {item}"
        
        # Check in by_client structure
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                assert "bond_code" in entry, f"Client entry should have 'bond_code' field: {entry}"
    
    def test_cashflow_entry_has_portfolio_category(self, api_client):
        """Test that each cashflow entry has portfolio_category field"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                assert "portfolio_category" in entry, f"Entry should have 'portfolio_category' field: {entry}"
    
    def test_cashflow_entry_has_required_fields(self, api_client):
        """Test that each cashflow entry has all required fields"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        required_fields = [
            "cashflow_id", "client_id", "client_name", "bond_id", "bond_name",
            "bond_code", "expected_date", "principal_net", "interest_net", 
            "net_amount", "reinvestment_tag", "portfolio_category"
        ]
        
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                for field in required_fields:
                    assert field in entry, f"Entry missing required field '{field}': {entry}"


class TestReinvestmentTagging:
    """Tests for PUT /api/reinvestment/tag/{cashflow_id} endpoint"""
    
    @pytest.fixture
    def sample_cashflow_id(self, api_client):
        """Get a sample cashflow ID for testing"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        # Find first untagged cashflow
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                return entry["cashflow_id"]
        
        pytest.skip("No cashflows available for testing")
    
    def test_tag_with_principal(self, api_client, sample_cashflow_id):
        """Test tagging a cashflow with 'principal' tag"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "principal",
                "portfolio_category": "wealth"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["reinvestment_tag"] == "principal"
        assert data["portfolio_category"] == "wealth"
    
    def test_tag_with_interest(self, api_client, sample_cashflow_id):
        """Test tagging a cashflow with 'interest' tag"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "interest",
                "portfolio_category": "tax"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["reinvestment_tag"] == "interest"
        assert data["portfolio_category"] == "tax"
    
    def test_tag_with_net_amount(self, api_client, sample_cashflow_id):
        """Test tagging a cashflow with 'net_amount' tag"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "net_amount",
                "portfolio_category": "short_term"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["reinvestment_tag"] == "net_amount"
        assert data["portfolio_category"] == "short_term"
    
    def test_tag_with_custom_amount(self, api_client, sample_cashflow_id):
        """Test tagging a cashflow with 'other' tag and custom amount"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "other",
                "custom_amount": 50000.0,
                "portfolio_category": "bonds"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["reinvestment_tag"] == "other"
        assert data["custom_amount"] == 50000.0
        assert data["portfolio_category"] == "bonds"
    
    def test_tag_not_invest(self, api_client, sample_cashflow_id):
        """Test tagging a cashflow with 'not_invest' tag"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "not_invest",
                "portfolio_category": None
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["reinvestment_tag"] == "not_invest"
    
    def test_untag_cashflow(self, api_client, sample_cashflow_id):
        """Test untagging a cashflow - setting tag back to 'not_tagged'"""
        # First tag it
        api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "principal",
                "portfolio_category": "wealth"
            }
        )
        
        # Now untag it
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "not_tagged",
                "custom_amount": None,
                "portfolio_category": None
            }
        )
        assert response.status_code == 200, f"Untag failed: {response.text}"
        
        data = response.json()
        assert data["reinvestment_tag"] == "not_tagged"
        assert data["portfolio_category"] is None
        assert data["custom_amount"] is None
    
    def test_untag_clears_portfolio_category(self, api_client, sample_cashflow_id):
        """Test that untagging clears the portfolio category"""
        # First tag with portfolio
        api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "interest",
                "portfolio_category": "commodities"
            }
        )
        
        # Verify it was tagged
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        # Find the entry
        entry_found = False
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                if entry["cashflow_id"] == sample_cashflow_id:
                    entry_found = True
                    assert entry["reinvestment_tag"] == "interest"
                    assert entry["portfolio_category"] == "commodities"
                    break
        
        # Now untag
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{sample_cashflow_id}",
            json={
                "reinvestment_tag": "not_tagged",
                "custom_amount": None,
                "portfolio_category": None
            }
        )
        assert response.status_code == 200
        
        # Verify it was untagged
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                if entry["cashflow_id"] == sample_cashflow_id:
                    assert entry["reinvestment_tag"] == "not_tagged", f"Tag should be 'not_tagged', got {entry['reinvestment_tag']}"
                    # Note: portfolio_category might be None or empty string
                    assert entry["portfolio_category"] in [None, ""], f"Portfolio should be cleared, got {entry['portfolio_category']}"
                    break
    
    def test_tag_nonexistent_cashflow(self, api_client):
        """Test tagging a non-existent cashflow returns 404"""
        response = api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/nonexistent-id-12345",
            json={
                "reinvestment_tag": "principal",
                "portfolio_category": "wealth"
            }
        )
        assert response.status_code == 404


class TestReinvestmentDataIntegrity:
    """Tests for data integrity after tagging/untagging"""
    
    def test_tagged_entry_appears_in_correct_section(self, api_client):
        """Test that tagged entries have correct tag values in response"""
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        # Get first cashflow
        if not data.get("by_client"):
            pytest.skip("No clients with cashflows")
        
        first_client = data["by_client"][0]
        if not first_client.get("entries"):
            pytest.skip("No entries for first client")
        
        cashflow_id = first_client["entries"][0]["cashflow_id"]
        
        # Tag it
        api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}",
            json={
                "reinvestment_tag": "net_amount",
                "portfolio_category": "real_estate"
            }
        )
        
        # Verify in response
        response = api_client.get(f"{BASE_URL}/api/reinvestment/upcoming")
        data = response.json()
        
        found = False
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                if entry["cashflow_id"] == cashflow_id:
                    found = True
                    assert entry["reinvestment_tag"] == "net_amount"
                    assert entry["portfolio_category"] == "real_estate"
                    break
        
        assert found, f"Cashflow {cashflow_id} not found in response"
        
        # Clean up - untag
        api_client.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}",
            json={
                "reinvestment_tag": "not_tagged",
                "custom_amount": None,
                "portfolio_category": None
            }
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
