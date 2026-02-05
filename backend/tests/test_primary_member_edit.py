"""
Tests for Primary Member Edit Feature - Auto-updates Family Name

Feature: When editing the primary member's name, the family_name should automatically update
E.g., 'John Doe & Family' -> 'Jane Smith & Family'

Test API: PUT /api/data-gathering/family/{family_id}/member/{member_id}
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review_request
TEST_PAN = "ANVPB5297J"
TEST_PASSWORD = "test123"
TEST_PIN = "111111"


class TestPrimaryMemberEditAutoUpdatesFamilyName:
    """Tests for primary member edit auto-updating family name"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers using two-step login"""
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
        
        token = step2_response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def test_family(self, auth_headers):
        """Create a test family for member editing tests"""
        unique_name = f"TEST_PrimaryEdit_{uuid.uuid4().hex[:8]}"
        payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1985-06-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": [
                {
                    "name": "TEST_Spouse",
                    "date_of_birth": "1988-03-20",
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
        assert response.status_code == 200, f"Failed to create test family: {response.text}"
        return response.json()["family"]
    
    def test_primary_member_name_change_updates_family_name(self, auth_headers, test_family):
        """
        Test: PUT /api/data-gathering/family/{family_id}/member/{member_id}
        When primary member's name is changed, family_name should auto-update
        """
        family_id = test_family["id"]
        original_family_name = test_family["family_name"]
        
        # Find primary member
        primary_member = None
        for member in test_family["members"]:
            if member.get("is_primary"):
                primary_member = member
                break
        
        assert primary_member is not None, "Primary member not found in test family"
        original_name = primary_member["name"]
        
        # Update primary member's name
        new_name = f"TEST_NewName_{uuid.uuid4().hex[:8]}"
        update_payload = {
            "name": new_name,
            "date_of_birth": primary_member.get("date_of_birth", "1985-06-15"),
            "relation": "Primary",
            "life_expectancy": primary_member.get("life_expectancy", 80),
            "tax_slab": primary_member.get("tax_slab", "30%")
        }
        
        response = requests.put(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/member/{primary_member['id']}",
            headers=auth_headers,
            json=update_payload
        )
        
        # Assert API returns success
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        
        result = response.json()
        assert "family" in result, "Response should include updated family data"
        
        # Assert family_name was updated
        updated_family = result["family"]
        expected_family_name = f"{new_name} & Family"
        assert updated_family["family_name"] == expected_family_name, \
            f"Family name not updated. Expected '{expected_family_name}', got '{updated_family['family_name']}'"
        
        # Verify primary member name is updated
        updated_primary = None
        for member in updated_family["members"]:
            if member.get("is_primary"):
                updated_primary = member
                break
        
        assert updated_primary is not None, "Primary member not found after update"
        assert updated_primary["name"] == new_name, \
            f"Primary member name not updated. Expected '{new_name}', got '{updated_primary['name']}'"
        
        print(f"✅ Primary member name change auto-updates family name")
        print(f"   Original name: {original_name}")
        print(f"   New name: {new_name}")
        print(f"   Original family name: {original_family_name}")
        print(f"   New family name: {updated_family['family_name']}")
    
    def test_non_primary_member_name_change_does_not_update_family_name(self, auth_headers, test_family):
        """
        Test: When a non-primary member's name is changed, family_name should NOT change
        """
        family_id = test_family["id"]
        original_family_name = test_family["family_name"]
        
        # Find non-primary member (spouse)
        non_primary_member = None
        for member in test_family["members"]:
            if not member.get("is_primary"):
                non_primary_member = member
                break
        
        assert non_primary_member is not None, "Non-primary member not found in test family"
        
        # Update non-primary member's name
        new_name = f"TEST_SpouseNew_{uuid.uuid4().hex[:8]}"
        update_payload = {
            "name": new_name,
            "date_of_birth": non_primary_member.get("date_of_birth", "1988-03-20"),
            "relation": non_primary_member.get("relation", "Spouse"),
            "life_expectancy": non_primary_member.get("life_expectancy", 85),
            "tax_slab": non_primary_member.get("tax_slab", "20%")
        }
        
        response = requests.put(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/member/{non_primary_member['id']}",
            headers=auth_headers,
            json=update_payload
        )
        
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        
        result = response.json()
        updated_family = result["family"]
        
        # Family name should remain unchanged
        assert updated_family["family_name"] == original_family_name, \
            f"Family name should not change when non-primary member is updated. " \
            f"Expected '{original_family_name}', got '{updated_family['family_name']}'"
        
        print(f"✅ Non-primary member name change does NOT update family name")
        print(f"   Family name remains: {updated_family['family_name']}")
    
    def test_primary_member_update_without_name_change(self, auth_headers, test_family):
        """
        Test: When primary member is updated but name stays same, family_name should NOT change
        """
        family_id = test_family["id"]
        original_family_name = test_family["family_name"]
        
        # Find primary member
        primary_member = None
        for member in test_family["members"]:
            if member.get("is_primary"):
                primary_member = member
                break
        
        assert primary_member is not None, "Primary member not found"
        
        # Update primary member's other fields (not name)
        update_payload = {
            "name": primary_member["name"],  # Same name
            "date_of_birth": primary_member.get("date_of_birth", "1985-06-15"),
            "relation": "Primary",
            "life_expectancy": 90,  # Changed life expectancy
            "tax_slab": "25%"  # Changed tax slab
        }
        
        response = requests.put(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/member/{primary_member['id']}",
            headers=auth_headers,
            json=update_payload
        )
        
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        
        result = response.json()
        updated_family = result["family"]
        
        # Family name should remain unchanged
        assert updated_family["family_name"] == original_family_name, \
            f"Family name should not change when primary member's name is unchanged"
        
        # Verify other fields were updated
        updated_primary = None
        for member in updated_family["members"]:
            if member.get("is_primary"):
                updated_primary = member
                break
        
        assert updated_primary["life_expectancy"] == 90, "Life expectancy not updated"
        assert updated_primary["tax_slab"] == "25%", "Tax slab not updated"
        
        print(f"✅ Primary member update without name change keeps family name intact")
    
    def test_existing_family_primary_member_edit(self, auth_headers):
        """
        Test: Edit primary member on existing family mentioned in context
        Family ID: da20d03f-6e9f-488e-8020-62b6a193fa70
        """
        existing_family_id = "da20d03f-6e9f-488e-8020-62b6a193fa70"
        
        # First, get the family details
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{existing_family_id}",
            headers=auth_headers
        )
        
        if get_response.status_code == 404:
            pytest.skip("Existing test family not found, may have been deleted")
        
        assert get_response.status_code == 200, f"Failed to get family: {get_response.text}"
        
        family = get_response.json()
        current_family_name = family.get("family_name", "")
        
        # Verify the family name format
        assert "& Family" in current_family_name, \
            f"Family name should contain '& Family'. Got: {current_family_name}"
        
        print(f"✅ Existing test family found: {current_family_name}")
        print(f"   Family ID: {existing_family_id}")
        print(f"   Members count: {len(family.get('members', []))}")
        
        # Find primary member
        primary_member = None
        for member in family.get("members", []):
            if member.get("is_primary"):
                primary_member = member
                break
        
        if primary_member:
            print(f"   Primary member: {primary_member['name']}")


class TestMemberCRUDOperations:
    """Additional tests for member CRUD operations"""
    
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
    
    def test_add_member_to_family(self, auth_headers):
        """Test: PUT /api/data-gathering/family/{id}/member - Add member to family"""
        # Create a family first
        unique_name = f"TEST_AddMember_{uuid.uuid4().hex[:8]}"
        create_payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1980-01-15",
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
        initial_member_count = len(family["members"])
        
        # Add a new member
        new_member_payload = {
            "name": "TEST_NewChild",
            "date_of_birth": "2010-05-20",
            "relation": "Son",
            "life_expectancy": 90,
            "tax_slab": "0%"
        }
        
        add_response = requests.put(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/member",
            headers=auth_headers,
            json=new_member_payload
        )
        
        assert add_response.status_code == 200, f"Failed to add member: {add_response.text}"
        
        # Verify member was added
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        updated_family = get_response.json()
        
        assert len(updated_family["members"]) == initial_member_count + 1, \
            f"Member count should increase by 1"
        
        # Find the new member
        new_member = None
        for m in updated_family["members"]:
            if m["name"] == "TEST_NewChild":
                new_member = m
                break
        
        assert new_member is not None, "New member not found"
        assert new_member["relation"] == "Son"
        
        print(f"✅ Add member API working, added: {new_member['name']}")
    
    def test_delete_non_primary_member(self, auth_headers):
        """Test: DELETE /api/data-gathering/family/{id}/member/{member_id}"""
        # Create a family with a member
        unique_name = f"TEST_DelMember_{uuid.uuid4().hex[:8]}"
        create_payload = {
            "broker_id": "",
            "sub_broker_id": None,
            "primary_holder": {
                "name": unique_name,
                "date_of_birth": "1980-01-15",
                "relation": "Primary",
                "life_expectancy": 80,
                "tax_slab": "30%"
            },
            "members": [
                {
                    "name": "TEST_ToDelete",
                    "date_of_birth": "1985-03-10",
                    "relation": "Spouse",
                    "life_expectancy": 85,
                    "tax_slab": "20%"
                }
            ]
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/data-gathering/family",
            headers=auth_headers,
            json=create_payload
        )
        assert create_response.status_code == 200
        family = create_response.json()["family"]
        family_id = family["id"]
        
        # Find the non-primary member to delete
        member_to_delete = None
        for m in family["members"]:
            if not m.get("is_primary"):
                member_to_delete = m
                break
        
        assert member_to_delete is not None, "Non-primary member not found"
        
        # Delete the member
        delete_response = requests.delete(
            f"{BASE_URL}/api/data-gathering/family/{family_id}/member/{member_to_delete['id']}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Failed to delete member: {delete_response.text}"
        
        # Verify member was deleted
        get_response = requests.get(
            f"{BASE_URL}/api/data-gathering/family/{family_id}",
            headers=auth_headers
        )
        updated_family = get_response.json()
        
        # Check the deleted member is gone
        deleted_member = None
        for m in updated_family["members"]:
            if m["id"] == member_to_delete["id"]:
                deleted_member = m
                break
        
        assert deleted_member is None, "Member should be deleted"
        
        print(f"✅ Delete member API working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
