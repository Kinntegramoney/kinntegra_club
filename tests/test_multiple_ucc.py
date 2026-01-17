"""
Test suite for Multiple UCC per Client feature
Tests:
1. POST /api/clients - Create client with ucc_list (1-5 items)
2. POST /api/clients - Reject empty ucc_list
3. POST /api/clients - Reject duplicate UCCs within ucc_list
4. POST /api/clients - Reject if UCC already exists for another client
5. PUT /api/clients/{id} - Update client with ucc_list
6. GET /api/reinvestment/upcoming - Returns client_ucc_list for each entry
7. PUT /api/reinvestment/tag/{id} - Accept target_ucc field
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for broker"""
    # Step 1: Login with PAN and password
    step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": BROKER_PAN,
        "password": BROKER_PASSWORD
    })
    
    if step1_response.status_code != 200:
        pytest.skip(f"Login step 1 failed: {step1_response.text}")
    
    temp_token = step1_response.json().get("temp_token")
    
    # Step 2: Verify PIN
    step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": BROKER_PIN
    })
    
    if step2_response.status_code != 200:
        pytest.skip(f"Login step 2 failed: {step2_response.text}")
    
    return step2_response.json().get("token")


@pytest.fixture
def auth_headers(auth_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestCreateClientWithMultipleUCCs:
    """Test POST /api/clients with ucc_list"""
    
    def test_create_client_with_single_ucc(self, auth_headers):
        """Create client with single UCC - should succeed"""
        unique_id = str(uuid.uuid4())[:8].upper()
        client_data = {
            "name": f"TEST_SingleUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}A",
            "ucc_list": [f"UCC{unique_id}1"],
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 200 or response.status_code == 201, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data.get("ucc_list") == [f"UCC{unique_id}1"]
        
        # Cleanup - delete the test client
        client_id = data["id"]
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
    
    def test_create_client_with_multiple_uccs(self, auth_headers):
        """Create client with 3 UCCs - should succeed"""
        unique_id = str(uuid.uuid4())[:8].upper()
        ucc_list = [f"UCC{unique_id}1", f"UCC{unique_id}2", f"UCC{unique_id}3"]
        client_data = {
            "name": f"TEST_MultiUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}B",
            "ucc_list": ucc_list,
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 200 or response.status_code == 201, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        # UCCs should be uppercased
        expected_uccs = [ucc.upper() for ucc in ucc_list]
        assert data.get("ucc_list") == expected_uccs
        
        # Cleanup
        client_id = data["id"]
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
    
    def test_create_client_with_max_5_uccs(self, auth_headers):
        """Create client with 5 UCCs (maximum) - should succeed"""
        unique_id = str(uuid.uuid4())[:8].upper()
        ucc_list = [f"UCC{unique_id}{i}" for i in range(1, 6)]
        client_data = {
            "name": f"TEST_MaxUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}C",
            "ucc_list": ucc_list,
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 200 or response.status_code == 201, f"Failed: {response.text}"
        data = response.json()
        assert len(data.get("ucc_list", [])) == 5
        
        # Cleanup
        client_id = data["id"]
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
    
    def test_create_client_with_empty_ucc_list_fails(self, auth_headers):
        """Create client with empty ucc_list - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        client_data = {
            "name": f"TEST_EmptyUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}D",
            "ucc_list": [],
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "At least one UCC is required" in response.text or "ucc" in response.text.lower()
    
    def test_create_client_with_more_than_5_uccs_fails(self, auth_headers):
        """Create client with 6 UCCs - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        ucc_list = [f"UCC{unique_id}{i}" for i in range(1, 7)]  # 6 UCCs
        client_data = {
            "name": f"TEST_TooManyUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}E",
            "ucc_list": ucc_list,
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Maximum 5 UCCs" in response.text or "5" in response.text
    
    def test_create_client_with_duplicate_uccs_fails(self, auth_headers):
        """Create client with duplicate UCCs in list - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        ucc_list = [f"UCC{unique_id}1", f"UCC{unique_id}2", f"UCC{unique_id}1"]  # Duplicate
        client_data = {
            "name": f"TEST_DupUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}F",
            "ucc_list": ucc_list,
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Duplicate" in response.text or "duplicate" in response.text.lower()
    
    def test_create_client_with_existing_ucc_fails(self, auth_headers):
        """Create client with UCC that already exists for another client - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        shared_ucc = f"SHAREDCC{unique_id}"
        
        # Create first client with the UCC
        client1_data = {
            "name": f"TEST_Client1_{unique_id}",
            "pan_number": f"TEST{unique_id}G",
            "ucc_list": [shared_ucc],
            "email": f"test1_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        response1 = requests.post(f"{BASE_URL}/api/clients", json=client1_data, headers=auth_headers)
        assert response1.status_code in [200, 201], f"First client creation failed: {response1.text}"
        client1_id = response1.json()["id"]
        
        # Try to create second client with same UCC
        client2_data = {
            "name": f"TEST_Client2_{unique_id}",
            "pan_number": f"TEST{unique_id}H",
            "ucc_list": [shared_ucc],
            "email": f"test2_{unique_id}@example.com",
            "mobile": "9876543211"
        }
        
        response2 = requests.post(f"{BASE_URL}/api/clients", json=client2_data, headers=auth_headers)
        
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}: {response2.text}"
        assert "already assigned" in response2.text.lower() or "exists" in response2.text.lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client1_id}", headers=auth_headers)


class TestUpdateClientWithMultipleUCCs:
    """Test PUT /api/clients/{id} with ucc_list"""
    
    def test_update_client_add_more_uccs(self, auth_headers):
        """Update client to add more UCCs - should succeed"""
        unique_id = str(uuid.uuid4())[:8].upper()
        
        # Create client with 1 UCC
        client_data = {
            "name": f"TEST_UpdateUCC_{unique_id}",
            "pan_number": f"TEST{unique_id}I",
            "ucc_list": [f"UCC{unique_id}1"],
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # Update to add more UCCs
        update_data = {
            "ucc_list": [f"UCC{unique_id}1", f"UCC{unique_id}2", f"UCC{unique_id}3"]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/clients/{client_id}", json=update_data, headers=auth_headers)
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated_data = update_response.json()
        assert len(updated_data.get("ucc_list", [])) == 3
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
    
    def test_update_client_with_duplicate_ucc_fails(self, auth_headers):
        """Update client with duplicate UCCs - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        
        # Create client
        client_data = {
            "name": f"TEST_UpdateDup_{unique_id}",
            "pan_number": f"TEST{unique_id}J",
            "ucc_list": [f"UCC{unique_id}1"],
            "email": f"test_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # Try to update with duplicate UCCs
        update_data = {
            "ucc_list": [f"UCC{unique_id}1", f"UCC{unique_id}2", f"UCC{unique_id}1"]  # Duplicate
        }
        
        update_response = requests.put(f"{BASE_URL}/api/clients/{client_id}", json=update_data, headers=auth_headers)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}: {update_response.text}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
    
    def test_update_client_with_existing_ucc_fails(self, auth_headers):
        """Update client with UCC that belongs to another client - should fail"""
        unique_id = str(uuid.uuid4())[:8].upper()
        
        # Create first client
        client1_data = {
            "name": f"TEST_Client1_{unique_id}",
            "pan_number": f"TEST{unique_id}K",
            "ucc_list": [f"UCCOWN{unique_id}"],
            "email": f"test1_{unique_id}@example.com",
            "mobile": "9876543210"
        }
        
        create1_response = requests.post(f"{BASE_URL}/api/clients", json=client1_data, headers=auth_headers)
        assert create1_response.status_code in [200, 201], f"Create client 1 failed: {create1_response.text}"
        client1_id = create1_response.json()["id"]
        
        # Create second client
        client2_data = {
            "name": f"TEST_Client2_{unique_id}",
            "pan_number": f"TEST{unique_id}L",
            "ucc_list": [f"UCCOTHER{unique_id}"],
            "email": f"test2_{unique_id}@example.com",
            "mobile": "9876543211"
        }
        
        create2_response = requests.post(f"{BASE_URL}/api/clients", json=client2_data, headers=auth_headers)
        assert create2_response.status_code in [200, 201], f"Create client 2 failed: {create2_response.text}"
        client2_id = create2_response.json()["id"]
        
        # Try to update client 2 with client 1's UCC
        update_data = {
            "ucc_list": [f"UCCOWN{unique_id}"]  # This belongs to client 1
        }
        
        update_response = requests.put(f"{BASE_URL}/api/clients/{client2_id}", json=update_data, headers=auth_headers)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}: {update_response.text}"
        assert "already assigned" in update_response.text.lower() or "exists" in update_response.text.lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client1_id}", headers=auth_headers)
        requests.delete(f"{BASE_URL}/api/clients/{client2_id}", headers=auth_headers)


class TestReinvestmentWithUCC:
    """Test reinvestment endpoints with UCC support"""
    
    def test_get_upcoming_reinvestments_has_client_ucc_list(self, auth_headers):
        """GET /api/reinvestment/upcoming should return client_ucc_list for each entry"""
        response = requests.get(f"{BASE_URL}/api/reinvestment/upcoming", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "by_client" in data
        
        # If there are clients with entries, check for client_ucc_list
        if data.get("by_client"):
            for client in data["by_client"]:
                for entry in client.get("entries", []):
                    # Each entry should have client_ucc_list field
                    assert "client_ucc_list" in entry, f"Entry missing client_ucc_list: {entry}"
                    # client_ucc_list should be a list
                    assert isinstance(entry["client_ucc_list"], list), f"client_ucc_list should be a list: {entry}"
                    print(f"Entry {entry.get('cashflow_id')}: client_ucc_list = {entry.get('client_ucc_list')}")
    
    def test_tag_reinvestment_with_target_ucc(self, auth_headers):
        """PUT /api/reinvestment/tag/{id} should accept target_ucc field"""
        # First get upcoming reinvestments to find a cashflow to tag
        response = requests.get(f"{BASE_URL}/api/reinvestment/upcoming", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get reinvestments: {response.text}"
        
        data = response.json()
        
        # Find a cashflow with UCCs to test
        test_cashflow = None
        test_ucc = None
        
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                if entry.get("client_ucc_list") and len(entry["client_ucc_list"]) > 0:
                    test_cashflow = entry
                    test_ucc = entry["client_ucc_list"][0]
                    break
            if test_cashflow:
                break
        
        if not test_cashflow:
            pytest.skip("No cashflows with UCCs found to test")
        
        cashflow_id = test_cashflow["cashflow_id"]
        
        # Tag with target_ucc
        tag_data = {
            "reinvestment_tag": "principal",
            "portfolio_category": "wealth",
            "target_ucc": test_ucc
        }
        
        tag_response = requests.put(f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}", json=tag_data, headers=auth_headers)
        
        assert tag_response.status_code == 200, f"Failed to tag: {tag_response.text}"
        tag_result = tag_response.json()
        assert tag_result.get("target_ucc") == test_ucc.upper(), f"target_ucc not saved correctly: {tag_result}"
        
        # Verify by fetching again
        verify_response = requests.get(f"{BASE_URL}/api/reinvestment/upcoming", headers=auth_headers)
        assert verify_response.status_code == 200
        
        verify_data = verify_response.json()
        found = False
        for client in verify_data.get("by_client", []):
            for entry in client.get("entries", []):
                if entry.get("cashflow_id") == cashflow_id:
                    assert entry.get("target_ucc") == test_ucc.upper(), f"target_ucc not persisted: {entry}"
                    found = True
                    break
        
        # Reset the tag
        reset_data = {
            "reinvestment_tag": "not_tagged"
        }
        requests.put(f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}", json=reset_data, headers=auth_headers)
    
    def test_tag_reinvestment_with_invalid_ucc_fails(self, auth_headers):
        """PUT /api/reinvestment/tag/{id} with invalid UCC should fail"""
        # First get upcoming reinvestments
        response = requests.get(f"{BASE_URL}/api/reinvestment/upcoming", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get reinvestments: {response.text}"
        
        data = response.json()
        
        # Find any cashflow to test
        test_cashflow = None
        for client in data.get("by_client", []):
            for entry in client.get("entries", []):
                test_cashflow = entry
                break
            if test_cashflow:
                break
        
        if not test_cashflow:
            pytest.skip("No cashflows found to test")
        
        cashflow_id = test_cashflow["cashflow_id"]
        
        # Try to tag with invalid UCC
        tag_data = {
            "reinvestment_tag": "principal",
            "portfolio_category": "wealth",
            "target_ucc": "INVALID_UCC_12345"
        }
        
        tag_response = requests.put(f"{BASE_URL}/api/reinvestment/tag/{cashflow_id}", json=tag_data, headers=auth_headers)
        
        assert tag_response.status_code == 400, f"Expected 400, got {tag_response.status_code}: {tag_response.text}"
        assert "does not belong" in tag_response.text.lower() or "invalid" in tag_response.text.lower()


class TestBulkUploadWithMultipleUCCs:
    """Test bulk upload template has UCC1-UCC5 columns"""
    
    def test_bulk_upload_template_has_ucc_columns(self, auth_headers):
        """GET /api/bulk/template/clients should have UCC1-UCC5 columns"""
        response = requests.get(f"{BASE_URL}/api/bulk/template/clients", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to download template: {response.text}"
        
        # Check content type is Excel
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower() or "octet-stream" in content_type, \
            f"Expected Excel file, got: {content_type}"
        
        # Check content disposition has filename
        content_disposition = response.headers.get("content-disposition", "")
        assert "client" in content_disposition.lower() and "template" in content_disposition.lower(), \
            f"Expected client template filename: {content_disposition}"
        
        print(f"Template downloaded successfully. Content-Type: {content_type}")
        print(f"Content-Disposition: {content_disposition}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
