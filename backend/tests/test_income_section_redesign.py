"""
Income Section Redesign API Tests
Tests for:
- POST /api/data-gathering/family/{family_id}/income - Add income entry with member dropdown
- PUT /api/data-gathering/family/{family_id}/income/{income_id} - Update income entry
- DELETE /api/data-gathering/family/{family_id}/income/{income_id} - Delete income entry
- Multiple entries for same category (e.g., two FDs for same person)
- Income categories and collapsible structure support
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_PAN = "ANVPB5297J"
TEST_PASSWORD = "test123"
TEST_PIN = "111111"


class TestIncomeSectionRedesign:
    """Tests for redesigned Income Section with collapsible categories"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": TEST_PAN, "password": TEST_PASSWORD}
        )
        assert step1_response.status_code == 200, f"Login step1 failed: {step1_response.text}"
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": TEST_PIN}
        )
        assert step2_response.status_code == 200, f"Login step2 failed: {step2_response.text}"
        token = step2_response.json().get("token")
        
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def test_family_with_members(self, auth_headers):
        """Create a test family with multiple members for income tests"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": f"TEST_IncomeRedesign_{unique_id}",
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_regime": "New Regime",
                "tax_status": "Resident",
                "tax_slab": "30%"
            },
            "members": [
                {
                    "name": f"TEST_Spouse_{unique_id}",
                    "date_of_birth": "1988-08-20",
                    "relation": "Spouse",
                    "life_expectancy": 85,
                    "tax_regime": "Old Regime",
                    "tax_status": "Resident",
                    "tax_slab": "20%"
                }
            ]
        }
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        assert response.status_code == 200, f"Failed to create test family: {response.text}"
        return response.json()["family"]
    
    def test_two_step_login(self, auth_headers):
        """Test two-step authentication"""
        assert auth_headers is not None
        assert "Authorization" in auth_headers
        print("✅ Two-step login successful")
    
    def test_add_income_entry_with_member_dropdown(self, auth_headers, test_family_with_members):
        """Test POST - Add income entry assigned to a specific family member"""
        family_id = test_family_with_members["id"]
        primary_member_id = test_family_with_members["members"][0]["id"]
        
        income_payload = {
            "family_id": family_id,
            "category": "salary",
            "member_ids": [primary_member_id],
            "details": {
                "net_income_monthly": 150000,
                "increment_month": "April",
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
        assert "income" in data
        assert data["income"]["category"] == "salary"
        assert primary_member_id in data["income"]["member_ids"]
        assert data["income"]["details"]["net_income_monthly"] == 150000
        
        print("✅ Add income entry with member assignment working")
        return data["income"]
    
    def test_add_multiple_fd_entries_same_person(self, auth_headers, test_family_with_members):
        """Test adding multiple FD entries for the same person (key requirement)"""
        family_id = test_family_with_members["id"]
        primary_member_id = test_family_with_members["members"][0]["id"]
        
        # First FD
        fd1_payload = {
            "family_id": family_id,
            "category": "fd",
            "member_ids": [primary_member_id],
            "details": {
                "principal_amount": 500000,
                "interest_rate": 7.5,
                "start_date": "2024-01-01",
                "maturity_date": "2025-01-01"
            }
        }
        
        response1 = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=fd1_payload
        )
        assert response1.status_code == 200, f"Failed to add FD 1: {response1.text}"
        fd1_id = response1.json()["income"]["id"]
        
        # Second FD for same person
        fd2_payload = {
            "family_id": family_id,
            "category": "fd",
            "member_ids": [primary_member_id],
            "details": {
                "principal_amount": 300000,
                "interest_rate": 7.0,
                "start_date": "2024-06-01",
                "maturity_date": "2025-06-01"
            }
        }
        
        response2 = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=fd2_payload
        )
        assert response2.status_code == 200, f"Failed to add FD 2: {response2.text}"
        fd2_id = response2.json()["income"]["id"]
        
        # Verify both FDs exist
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        family_data = get_response.json()
        
        fd_entries = [inc for inc in family_data["income_details"] if inc["category"] == "fd"]
        assert len(fd_entries) >= 2, f"Expected at least 2 FD entries, found {len(fd_entries)}"
        
        # Verify both are for same member
        for fd in fd_entries[-2:]:
            assert primary_member_id in fd["member_ids"]
        
        print(f"✅ Multiple FD entries for same person working - found {len(fd_entries)} FD entries")
    
    def test_add_income_entries_different_categories(self, auth_headers, test_family_with_members):
        """Test adding income entries for different categories"""
        family_id = test_family_with_members["id"]
        members = test_family_with_members["members"]
        primary_id = members[0]["id"]
        spouse_id = members[1]["id"] if len(members) > 1 else primary_id
        
        # Test multiple income categories
        categories_to_test = [
            ("salary", primary_id, {"net_income_monthly": 100000, "increment_month": "January", "avg_growth_rate": 8, "retirement_age": 58}),
            ("business", spouse_id, {"net_income_yearly": 600000, "avg_growth_rate": 12, "retirement_age": 65}),
            ("rental", primary_id, {"property_type": "Residential", "purchase_value": 5000000, "market_value": 7000000, "rental_monthly": 25000, "rental_increment_percent": 5}),
            ("ppf", primary_id, {"amount": 150000, "maturity_date": "2030-04-01"}),
            ("mutual_fund", primary_id, {"market_value": 500000, "sip_amount": 10000}),
        ]
        
        success_count = 0
        for category, member_id, details in categories_to_test:
            payload = {
                "family_id": family_id,
                "category": category,
                "member_ids": [member_id],
                "details": details
            }
            
            response = requests.post(
                f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
                headers=auth_headers,
                json=payload
            )
            
            if response.status_code == 200:
                success_count += 1
                print(f"  ✅ {category} income added")
            else:
                print(f"  ❌ {category} failed: {response.text}")
        
        assert success_count >= 4, f"Expected at least 4 categories to succeed, only {success_count} did"
        print(f"✅ Multiple income categories working ({success_count}/{len(categories_to_test)} succeeded)")
    
    def test_update_income_entry(self, auth_headers, test_family_with_members):
        """Test PUT - Update income entry"""
        family_id = test_family_with_members["id"]
        primary_member_id = test_family_with_members["members"][0]["id"]
        
        # First create an income entry
        create_payload = {
            "family_id": family_id,
            "category": "gold",
            "member_ids": [primary_member_id],
            "details": {"market_value": 200000}
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200
        income_id = create_response.json()["income"]["id"]
        
        # Update the income entry
        update_payload = {
            "family_id": family_id,
            "category": "gold",
            "member_ids": [primary_member_id],
            "details": {"market_value": 350000}  # Updated value
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income/{income_id}",
            headers=auth_headers,
            json=update_payload
        )
        
        assert update_response.status_code == 200, f"Failed to update income: {update_response.text}"
        
        # Verify update
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        family_data = get_response.json()
        
        updated_income = None
        for inc in family_data["income_details"]:
            if inc["id"] == income_id:
                updated_income = inc
                break
        
        assert updated_income is not None
        assert updated_income["details"]["market_value"] == 350000
        print("✅ Update income entry working")
    
    def test_delete_income_entry(self, auth_headers, test_family_with_members):
        """Test DELETE - Delete income entry"""
        family_id = test_family_with_members["id"]
        primary_member_id = test_family_with_members["members"][0]["id"]
        
        # First create an income entry
        create_payload = {
            "family_id": family_id,
            "category": "cash",
            "member_ids": [primary_member_id],
            "details": {"market_value": 50000}
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200
        income_id = create_response.json()["income"]["id"]
        
        # Delete the income entry
        delete_response = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income/{income_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Failed to delete income: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        family_data = get_response.json()
        
        deleted_income = None
        for inc in family_data["income_details"]:
            if inc["id"] == income_id:
                deleted_income = inc
                break
        
        assert deleted_income is None, "Income entry should have been deleted"
        print("✅ Delete income entry working")
    
    def test_income_entry_has_required_fields(self, auth_headers, test_family_with_members):
        """Test that income entries have all required fields: id, category, member_ids, details, created_at, created_by"""
        family_id = test_family_with_members["id"]
        primary_member_id = test_family_with_members["members"][0]["id"]
        
        create_payload = {
            "family_id": family_id,
            "category": "bond",
            "member_ids": [primary_member_id],
            "details": {
                "principal_amount": 100000,
                "interest_rate": 7.5,
                "maturity_date": "2027-01-01"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=create_payload
        )
        
        assert response.status_code == 200
        income_entry = response.json()["income"]
        
        # Verify required fields
        required_fields = ["id", "category", "member_ids", "details", "created_at", "created_by"]
        for field in required_fields:
            assert field in income_entry, f"Missing required field: {field}"
        
        assert income_entry["category"] == "bond"
        assert isinstance(income_entry["member_ids"], list)
        assert isinstance(income_entry["details"], dict)
        
        print("✅ Income entry has all required fields")
    
    def test_assign_income_to_spouse_member(self, auth_headers, test_family_with_members):
        """Test assigning income to spouse (non-primary) member via member dropdown"""
        family_id = test_family_with_members["id"]
        members = test_family_with_members["members"]
        
        # Get spouse member
        spouse_member = None
        for m in members:
            if m.get("relation") == "Spouse" or not m.get("is_primary", False):
                spouse_member = m
                break
        
        if not spouse_member:
            pytest.skip("No spouse member found in test family")
        
        income_payload = {
            "family_id": family_id,
            "category": "pension",
            "member_ids": [spouse_member["id"]],
            "details": {
                "amount": 30000,
                "payable_cycle": "Monthly",
                "start_date": "2025-01-01",
                "end_date": "2040-01-01"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/income",
            headers=auth_headers,
            json=income_payload
        )
        
        assert response.status_code == 200, f"Failed to add spouse income: {response.text}"
        data = response.json()["income"]
        assert spouse_member["id"] in data["member_ids"]
        
        print(f"✅ Income assigned to spouse member ({spouse_member['name']}) successfully")


class TestTaxStatusConditionalLogic:
    """Tests for Tax Status conditional logic - Foreign Passport disables Tax Regime and Tax Slab"""
    
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
    
    def test_create_family_with_foreign_passport_member(self, auth_headers):
        """Test creating family with Foreign Passport tax status"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": f"TEST_ForeignPassport_{unique_id}",
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_regime": "NA",  # Should be NA for Foreign Passport
                "tax_status": "Foreign Passport",
                "tax_slab": "0%"  # Should be 0% for Foreign Passport
            },
            "members": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create family: {response.text}"
        family = response.json()["family"]
        primary_member = family["members"][0]
        
        assert primary_member["tax_status"] == "Foreign Passport"
        # Tax regime and slab should be stored as provided (NA and 0%)
        assert primary_member["tax_regime"] == "NA"
        assert primary_member["tax_slab"] == "0%"
        
        print("✅ Foreign Passport member created with NA regime and 0% slab")
    
    def test_create_family_with_nri_foreign_passport(self, auth_headers):
        """Test creating family with NRI with Foreign Passport tax status"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": f"TEST_NRIForeign_{unique_id}",
                "date_of_birth": "1980-03-20",
                "relation": "Primary",
                "life_expectancy": 85,
                "tax_regime": "NA",
                "tax_status": "NRI with Foreign Passport",
                "tax_slab": "0%"
            },
            "members": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create family: {response.text}"
        family = response.json()["family"]
        primary_member = family["members"][0]
        
        assert primary_member["tax_status"] == "NRI with Foreign Passport"
        assert primary_member["tax_regime"] == "NA"
        assert primary_member["tax_slab"] == "0%"
        
        print("✅ NRI with Foreign Passport member created with NA regime and 0% slab")
    
    def test_resident_has_normal_tax_options(self, auth_headers):
        """Test that Resident status allows normal Tax Regime and Tax Slab"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": f"TEST_Resident_{unique_id}",
                "date_of_birth": "1985-05-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_regime": "New Regime",
                "tax_status": "Resident",
                "tax_slab": "30%"
            },
            "members": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create family: {response.text}"
        family = response.json()["family"]
        primary_member = family["members"][0]
        
        assert primary_member["tax_status"] == "Resident"
        assert primary_member["tax_regime"] == "New Regime"
        assert primary_member["tax_slab"] == "30%"
        
        print("✅ Resident member has normal Tax Regime and Tax Slab options")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
