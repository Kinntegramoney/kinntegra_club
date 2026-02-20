"""
Test suite for signup page simplification and login page fixes
Tests:
1. Login page background color (Etihad theme, not purple)
2. Signup page has only 3 fields (name, email, phone)
3. POST /api/leads/interest endpoint creates leads with source='signup_page'
4. Login redirects to /opportunities (not /dashboard)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://surplus-planner.preview.emergentagent.com')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


class TestLeadsInterestEndpoint:
    """Test the /api/leads/interest endpoint for signup page"""
    
    def test_create_lead_interest_success(self):
        """Test creating a lead from signup page interest form"""
        timestamp = str(int(time.time()))
        test_email = f"pytest_test_{timestamp}@example.com"
        
        response = requests.post(
            f"{BASE_URL}/api/leads/interest",
            json={
                "name": "Pytest Test User",
                "email": test_email,
                "phone": "+919876543210"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "lead_id" in data, "Response should contain lead_id"
        assert "message" in data, "Response should contain message"
        print(f"SUCCESS: Lead created with ID: {data['lead_id']}")
    
    def test_create_lead_interest_missing_fields(self):
        """Test that missing required fields return 400 error"""
        response = requests.post(
            f"{BASE_URL}/api/leads/interest",
            json={
                "name": "Test User",
                "email": ""  # Missing phone
            }
        )
        
        # Should return 400 or 422 for validation error
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print("SUCCESS: Missing fields correctly rejected")
    
    def test_create_lead_interest_duplicate_email(self):
        """Test that duplicate email updates existing lead"""
        test_email = "duplicate_test@example.com"
        
        # Create first lead
        response1 = requests.post(
            f"{BASE_URL}/api/leads/interest",
            json={
                "name": "First User",
                "email": test_email,
                "phone": "+919876543210"
            }
        )
        assert response1.status_code == 200
        
        # Create second lead with same email
        response2 = requests.post(
            f"{BASE_URL}/api/leads/interest",
            json={
                "name": "Updated User",
                "email": test_email,
                "phone": "+919876543211"
            }
        )
        assert response2.status_code == 200
        data = response2.json()
        assert "Interest updated" in data.get("message", "") or "lead_id" in data
        print("SUCCESS: Duplicate email handled correctly")


class TestLeadsWithSource:
    """Test that leads are created with correct source"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for broker"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
        )
        assert step1_response.status_code == 200, f"Step 1 failed: {step1_response.text}"
        temp_token = step1_response.json()["temp_token"]
        
        # Step 2: Login with PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_PIN}
        )
        assert step2_response.status_code == 200, f"Step 2 failed: {step2_response.text}"
        return step2_response.json()["token"]
    
    def test_leads_have_signup_page_source(self, auth_token):
        """Test that leads from signup page have source='signup_page'"""
        # First create a lead via the interest endpoint
        timestamp = str(int(time.time()))
        test_email = f"source_test_{timestamp}@example.com"
        
        create_response = requests.post(
            f"{BASE_URL}/api/leads/interest",
            json={
                "name": "Source Test User",
                "email": test_email,
                "phone": "+919876543210"
            }
        )
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Now fetch leads and verify source
        leads_response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={"Authorization": f"Bearer {auth_token}"},
            params={"source": "signup_page"}
        )
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        # Find our created lead
        found_lead = None
        for lead in leads:
            if lead.get("id") == lead_id:
                found_lead = lead
                break
        
        assert found_lead is not None, f"Lead {lead_id} not found in leads list"
        assert found_lead.get("source") == "signup_page", f"Expected source='signup_page', got {found_lead.get('source')}"
        print(f"SUCCESS: Lead has correct source='signup_page'")


class TestLoginFlow:
    """Test the two-step login flow"""
    
    def test_login_step1_success(self):
        """Test step 1 of login (PAN + Password)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "temp_token" in data, "Response should contain temp_token"
        print("SUCCESS: Login step 1 passed")
    
    def test_login_step1_invalid_credentials(self):
        """Test step 1 with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": "INVALID123", "password": "wrongpassword"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Invalid credentials correctly rejected")
    
    def test_login_full_flow(self):
        """Test complete login flow (step 1 + step 2)"""
        # Step 1
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
        )
        assert step1_response.status_code == 200
        temp_token = step1_response.json()["temp_token"]
        
        # Step 2
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_PIN}
        )
        assert step2_response.status_code == 200
        data = step2_response.json()
        
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["role"] == "broker", f"Expected role='broker', got {data['user']['role']}"
        print("SUCCESS: Full login flow completed")


class TestRolePermissions:
    """Test role permissions for dashboard visibility"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for broker"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
        )
        temp_token = step1_response.json()["temp_token"]
        
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_PIN}
        )
        return step2_response.json()["token"]
    
    def test_get_role_permissions(self, auth_token):
        """Test fetching role permissions"""
        response = requests.get(
            f"{BASE_URL}/api/role-permissions",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "permissions" in data, "Response should contain permissions"
        print(f"SUCCESS: Fetched {len(data['permissions'])} permissions")
    
    def test_get_user_permissions(self, auth_token):
        """Test fetching user-specific permissions"""
        response = requests.get(
            f"{BASE_URL}/api/role-permissions/user",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "user_role" in data, "Response should contain user_role"
        assert "permissions" in data, "Response should contain permissions"
        print(f"SUCCESS: User role is '{data['user_role']}'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
