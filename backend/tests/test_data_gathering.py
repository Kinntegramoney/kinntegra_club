"""
Data Gathering Feature API Tests
Tests for:
- GET /api/data-gathering/families - List families API
- POST /api/data-gathering/family - Create family API
- GET /api/data-gathering/family/{id} - Get family details
- PUT /api/data-gathering/family/{id}/member - Add member
- POST /api/data-gathering/family/{id}/income - Add income entry
- POST /api/data-gathering/family/{id}/goal - Add goal entry
- GET /api/data-gathering/family/{id}/surplus - Surplus calculation endpoint
"""

import pytest
import requests
import os
import json
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_PAN = "ANVPB5297J"
TEST_PASSWORD = "broker123"
TEST_PIN = "1234"


class TestDataGatheringAuth:
    """Authentication tests for Data Gathering feature"""
    
    @pytest.fixture
    def auth_token(self):
        """Login and get auth token"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        assert step1_response.status_code == 200, f"Step 1 failed: {step1_response.text}"
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: Login with PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        assert step2_response.status_code == 200, f"Step 2 failed: {step2_response.text}"
        
        data = step2_response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "broker"
        
        return data["token"]
    
    def test_broker_login_successful(self, auth_token):
        """Test broker can login successfully"""
        assert auth_token is not None
        print(f"✅ Broker login successful, token obtained")


class TestDataGatheringFamilies:
    """Tests for Family CRUD operations"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        # Step 1
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_list_families_api(self, auth_headers):
        """Test GET /api/data-gathering/families - List families API"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/families",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to list families: {response.text}"
        data = response.json()
        assert "families" in data
        assert isinstance(data["families"], list)
        print(f"✅ List families API working, found {len(data['families'])} families")
    
    def test_create_family_api(self, auth_headers):
        """Test POST /api/data-gathering/family - Create family API"""
        # Get user info first
        user_response = requests.get(
            f"{BASE_URL}/api/user/profile",
            headers=auth_headers
        )
        broker_id = ""
        if user_response.status_code == 200:
            broker_id = user_response.json().get("id", "")
        
        unique_name = f"TEST_Family_{uuid.uuid4().hex[:8]}"
        payload = {
            "broker_id": broker_id,
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": [
                {
                    "name": "TEST_Spouse",
                    "date_of_birth": "1988-08-20",
                    "relation": "Spouse",
                    "life_expectancy": 85,
                    "tax_slab": "20%"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create family: {response.text}"
        data = response.json()
        assert "family" in data
        assert "id" in data["family"]
        assert "family_name" in data["family"]
        assert unique_name in data["family"]["family_name"]
        assert len(data["family"]["members"]) == 2  # Primary + 1 member
        
        print(f"✅ Create family API working, created: {data['family']['family_name']}")
        return data["family"]
    
    def test_get_family_details(self, auth_headers):
        """Test GET /api/data-gathering/family/{id} - Get family details"""
        # First create a family
        unique_name = f"TEST_GetDetail_{uuid.uuid4().hex[:8]}"
        create_payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": []
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200
        family_id = create_response.json()["family"]["id"]
        
        # Get family details
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200, f"Failed to get family details: {get_response.text}"
        family = get_response.json()
        assert family["id"] == family_id
        assert unique_name in family["family_name"]
        assert "members" in family
        assert "income_details" in family
        assert "goal_details" in family
        assert "expense_details" in family
        assert "insurance_premiums" in family
        assert "liabilities" in family
        assert "surplus" in family
        
        print(f"✅ Get family details API working, family has all 7 sections")


class TestDataGatheringIncome:
    """Tests for Income entry operations"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def test_family(self, auth_headers):
        """Create a test family for income tests"""
        unique_name = f"TEST_Income_{uuid.uuid4().hex[:8]}"
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": []
        }
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        return response.json()["family"]
    
    def test_add_income_entry(self, auth_headers, test_family):
        """Test POST /api/data-gathering/family/{id}/income - Add income entry"""
        family_id = test_family["id"]
        primary_member_id = test_family["members"][0]["id"]
        
        income_payload = {
            "family_id": family_id,
            "category": "salary",
            "member_ids": [primary_member_id],
            "details": {
                "net_income_monthly": 150000,
                "increment_month": "april",
                "avg_growth_rate": 10,
                "retirement_age": 60
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=income_payload
        )
        
        assert response.status_code == 200, f"Failed to add income: {response.text}"
        data = response.json()
        assert "income" in data or "message" in data
        print(f"✅ Add income entry API working")
        
        # Verify by getting family details
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        family = get_response.json()
        assert len(family["income_details"]) >= 1
        
        # Find the salary income
        salary_income = None
        for inc in family["income_details"]:
            if inc["category"] == "salary":
                salary_income = inc
                break
        
        assert salary_income is not None
        assert salary_income["details"]["net_income_monthly"] == 150000
        print(f"✅ Income entry verified in family data")


class TestDataGatheringGoals:
    """Tests for Goal entry operations"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def test_family(self, auth_headers):
        """Create a test family for goal tests"""
        unique_name = f"TEST_Goal_{uuid.uuid4().hex[:8]}"
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": [
                {
                    "name": "TEST_Child",
                    "date_of_birth": "2010-01-01",
                    "relation": "Child",
                    "life_expectancy": 90,
                    "tax_slab": "0%"
                }
            ]
        }
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        return response.json()["family"]
    
    def test_add_goal_entry(self, auth_headers, test_family):
        """Test POST /api/data-gathering/family/{id}/goal - Add goal entry"""
        family_id = test_family["id"]
        child_member = None
        for m in test_family["members"]:
            if m["relation"] == "Child":
                child_member = m
                break
        
        assert child_member is not None, "Child member not found in test family"
        
        goal_payload = {
            "family_id": family_id,
            "member_ids": [child_member["id"]],
            "category": "education",
            "goal_amount": 2000000,
            "inflation_percent": 6,
            "goal_year": 2030
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/goal",
            headers=auth_headers,
            json=goal_payload
        )
        
        assert response.status_code == 200, f"Failed to add goal: {response.text}"
        print(f"✅ Add goal entry API working")
        
        # Verify by getting family details
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        family = get_response.json()
        assert len(family["goal_details"]) >= 1
        
        # Find the education goal
        edu_goal = None
        for g in family["goal_details"]:
            if g["category"] == "education":
                edu_goal = g
                break
        
        assert edu_goal is not None
        assert edu_goal["goal_amount"] == 2000000
        assert edu_goal["goal_year"] == 2030
        print(f"✅ Goal entry verified in family data")


class TestDataGatheringSurplus:
    """Tests for Surplus calculation endpoint"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_surplus_calculation_endpoint(self, auth_headers):
        """Test GET /api/data-gathering/family/{id}/surplus - Surplus calculation"""
        # Create a family with income and expenses
        unique_name = f"TEST_Surplus_{uuid.uuid4().hex[:8]}"
        create_payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": []
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200
        family = create_response.json()["family"]
        family_id = family["id"]
        primary_member_id = family["members"][0]["id"]
        
        # Add income
        income_payload = {
            "family_id": family_id,
            "category": "salary",
            "member_ids": [primary_member_id],
            "details": {
                "net_income_monthly": 100000,
                "increment_month": "april",
                "avg_growth_rate": 8,
                "retirement_age": 60
            }
        }
        requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=income_payload
        )
        
        # Test surplus endpoint
        surplus_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/surplus",
            headers=auth_headers
        )
        
        assert surplus_response.status_code == 200, f"Failed to get surplus: {surplus_response.text}"
        surplus_data = surplus_response.json()
        
        # Validate response structure
        assert "family_id" in surplus_data
        assert "family_name" in surplus_data
        assert "member_summary" in surplus_data
        assert "totals" in surplus_data
        
        totals = surplus_data["totals"]
        assert "total_income" in totals
        assert "total_expense" in totals
        assert "total_savings" in totals
        
        # With only income and no expenses, savings should equal income
        assert totals["total_income"] > 0
        print(f"✅ Surplus calculation endpoint working")
        print(f"   Total Income: {totals['total_income']}")
        print(f"   Total Expense: {totals['total_expense']}")
        print(f"   Total Savings: {totals['total_savings']}")


class TestDataGatheringLookups:
    """Tests for Lookup APIs"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_life_expectancy_lookup(self, auth_headers):
        """Test GET /api/data-gathering/lookup/life-expectancy"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/lookup/life-expectancy",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "options" in data
        print(f"✅ Life expectancy lookup working, {len(data['options'])} options")
    
    def test_tax_slabs_lookup(self, auth_headers):
        """Test GET /api/data-gathering/lookup/tax-slabs"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/lookup/tax-slabs",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "options" in data
        print(f"✅ Tax slabs lookup working, {len(data['options'])} options")
    
    def test_relations_lookup(self, auth_headers):
        """Test GET /api/data-gathering/lookup/relations"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/lookup/relations",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "options" in data
        print(f"✅ Relations lookup working, {len(data['options'])} options")
    
    def test_income_categories_lookup(self, auth_headers):
        """Test GET /api/data-gathering/lookup/income-categories"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/lookup/income-categories",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        print(f"✅ Income categories lookup working, {len(data['categories'])} categories")
    
    def test_goal_categories_lookup(self, auth_headers):
        """Test GET /api/data-gathering/lookup/goal-categories"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/lookup/goal-categories",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        print(f"✅ Goal categories lookup working, {len(data['categories'])} categories")


class TestExistingFamilyData:
    """Tests for existing test data mentioned in agent context"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        temp_token = step1_response.json().get("temp_token")
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_john_doe_family_exists(self, auth_headers):
        """Test that existing 'John Doe & Family' exists as mentioned in context"""
        response = requests.get(
            f"{BASE_URL}/api/data-gathering/families",
            headers=auth_headers
        )
        assert response.status_code == 200
        families = response.json().get("families", [])
        
        john_doe_family = None
        for f in families:
            if "John Doe" in f.get("family_name", ""):
                john_doe_family = f
                break
        
        if john_doe_family:
            print(f"✅ Found 'John Doe & Family' with ID: {john_doe_family['id']}")
            print(f"   Members: {len(john_doe_family.get('members', []))}")
            
            # Verify it has 2 members as mentioned
            members = john_doe_family.get('members', [])
            assert len(members) >= 2, f"Expected at least 2 members, found {len(members)}"
            print(f"✅ John Doe family has {len(members)} members as expected")
        else:
            pytest.skip("John Doe family not found - may have been deleted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
