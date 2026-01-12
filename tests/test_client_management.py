"""
Client Management Module Tests
Tests for:
- Client CRUD operations (Create, Read, Update, Delete)
- Client-SubBroker linking/unlinking
- Bond allocation to clients
- Allocation status updates (units blocked/paid)
"""

import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed_users.py
BROKER_CREDENTIALS = {
    "pan": "ABCDE1234F",
    "password": "broker123",
    "pin": "1234"
}

SUB_BROKER_CREDENTIALS = {
    "pan": "FGHIJ5678K",
    "password": "subbroker123",
    "pin": "5678"
}


def get_broker_token():
    """Helper to get broker authentication token"""
    step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": BROKER_CREDENTIALS["pan"],
        "password": BROKER_CREDENTIALS["password"]
    })
    if step1.status_code != 200:
        raise Exception(f"Login step 1 failed: {step1.text}")
    temp_token = step1.json()["temp_token"]
    
    step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": BROKER_CREDENTIALS["pin"]
    })
    if step2.status_code != 200:
        raise Exception(f"Login step 2 failed: {step2.text}")
    return step2.json()["token"]


def get_subbroker_token():
    """Helper to get sub-broker authentication token"""
    step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": SUB_BROKER_CREDENTIALS["pan"],
        "password": SUB_BROKER_CREDENTIALS["password"]
    })
    if step1.status_code != 200:
        raise Exception(f"Sub-broker login step 1 failed: {step1.text}")
    temp_token = step1.json()["temp_token"]
    
    step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": SUB_BROKER_CREDENTIALS["pin"]
    })
    if step2.status_code != 200:
        raise Exception(f"Sub-broker login step 2 failed: {step2.text}")
    return step2.json()["token"]


def generate_random_pan():
    """Generate a random PAN number for testing"""
    letters = ''.join(random.choices(string.ascii_uppercase, k=5))
    numbers = ''.join(random.choices(string.digits, k=4))
    last_letter = random.choice(string.ascii_uppercase)
    return f"{letters}{numbers}{last_letter}"


class TestClientCRUD:
    """Test Client CRUD operations"""
    
    @pytest.fixture
    def broker_token(self):
        return get_broker_token()
    
    @pytest.fixture
    def subbroker_token(self):
        return get_subbroker_token()
    
    def test_create_client_with_all_details(self, broker_token):
        """Test creating a client with all details (Personal, Address, Bank, Nominee)"""
        random_suffix = random.randint(10000, 99999)
        pan = generate_random_pan()
        
        client_data = {
            # Personal Details
            "name": f"TEST_Client_{random_suffix}",
            "pan_number": pan,
            "occupation": "Business",
            "date_of_birth": "1990-05-15",
            "father_husband_name": "Test Father",
            "demat_account_no": f"DEMAT{random_suffix}",
            "email": f"test_client_{random_suffix}@example.com",
            "mobile": f"+919876{random_suffix}",
            
            # Address Details
            "address_line1": "123 Test Street",
            "address_line2": "Suite 100",
            "city": "Mumbai",
            "state": "Maharashtra",
            "country": "India",
            "pincode": "400001",
            
            # Bank Details
            "bank_name": "HDFC Bank",
            "account_number": f"ACC{random_suffix}",
            "branch": "Mumbai Main",
            "ifsc_code": "HDFC0001234",
            
            # Nominee Details
            "nominee_name": "Test Nominee",
            "nominee_dob": "1985-01-01",
            "nominee_mobile": f"+919123{random_suffix}",
            "nominee_relationship": "Spouse"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert response.status_code == 200, f"Failed to create client: {response.text}"
        data = response.json()
        
        # Verify all fields are returned
        assert "id" in data
        assert data["name"] == client_data["name"]
        assert data["pan_number"] == pan.upper()
        assert data["email"] == client_data["email"]
        assert data["mobile"] == client_data["mobile"]
        assert data["city"] == client_data["city"]
        assert data["bank_name"] == client_data["bank_name"]
        assert data["nominee_name"] == client_data["nominee_name"]
        assert data["bond_allocations"] == []
        
        print(f"✓ Client created with ID: {data['id']}")
        return data["id"]
    
    def test_create_client_minimal_required_fields(self, broker_token):
        """Test creating a client with only required fields"""
        random_suffix = random.randint(10000, 99999)
        pan = generate_random_pan()
        
        client_data = {
            "name": f"TEST_Minimal_Client_{random_suffix}",
            "pan_number": pan,
            "email": f"minimal_{random_suffix}@example.com",
            "mobile": f"+919000{random_suffix}"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert response.status_code == 200, f"Failed to create minimal client: {response.text}"
        data = response.json()
        
        assert data["name"] == client_data["name"]
        assert data["pan_number"] == pan.upper()
        print(f"✓ Minimal client created: {data['name']}")
        return data["id"]
    
    def test_create_client_duplicate_pan_rejected(self, broker_token):
        """Test that duplicate PAN is rejected"""
        pan = generate_random_pan()
        
        # Create first client
        client_data = {
            "name": "TEST_First_Client",
            "pan_number": pan,
            "email": "first@example.com",
            "mobile": "+919999999999"
        }
        
        response1 = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response1.status_code == 200
        
        # Try to create second client with same PAN
        client_data["name"] = "TEST_Second_Client"
        client_data["email"] = "second@example.com"
        
        response2 = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert response2.status_code == 400
        assert "already exists" in response2.json().get("detail", "").lower()
        print("✓ Duplicate PAN correctly rejected")
    
    def test_get_clients_list(self, broker_token):
        """Test getting list of all clients"""
        response = requests.get(f"{BASE_URL}/api/clients", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} clients")
        return data
    
    def test_get_single_client(self, broker_token):
        """Test getting a single client by ID"""
        # First create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Single_Client",
            "pan_number": pan,
            "email": "single@example.com",
            "mobile": "+919111111111"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Get the client
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == client_id
        assert data["name"] == client_data["name"]
        print(f"✓ Retrieved single client: {data['name']}")
    
    def test_update_client(self, broker_token):
        """Test updating client details"""
        # First create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Update_Client",
            "pan_number": pan,
            "email": "update@example.com",
            "mobile": "+919222222222",
            "city": "Mumbai"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Update the client
        update_data = {
            "name": "TEST_Updated_Client_Name",
            "city": "Delhi",
            "bank_name": "ICICI Bank"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/clients/{client_id}", json=update_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["name"] == update_data["name"]
        assert data["city"] == update_data["city"]
        assert data["bank_name"] == update_data["bank_name"]
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert get_response.json()["name"] == update_data["name"]
        print("✓ Client updated successfully")
    
    def test_delete_client(self, broker_token):
        """Test deleting a client"""
        # First create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Delete_Client",
            "pan_number": pan,
            "email": "delete@example.com",
            "mobile": "+919333333333"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Delete the client
        delete_response = requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        assert delete_response.status_code == 200
        assert "deleted" in delete_response.json().get("message", "").lower()
        
        # Verify client is deleted
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert get_response.status_code == 404
        print("✓ Client deleted successfully")
    
    def test_subbroker_cannot_create_client(self, subbroker_token):
        """Test that sub-broker cannot create clients"""
        client_data = {
            "name": "TEST_Forbidden_Client",
            "pan_number": generate_random_pan(),
            "email": "forbidden@example.com",
            "mobile": "+919444444444"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        
        assert response.status_code == 403
        print("✓ Sub-broker correctly forbidden from creating clients")
    
    def test_subbroker_cannot_delete_client(self, broker_token, subbroker_token):
        """Test that sub-broker cannot delete clients"""
        # Create a client as broker
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_NoDelete_Client",
            "pan_number": pan,
            "email": "nodelete@example.com",
            "mobile": "+919555555555"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Try to delete as sub-broker
        delete_response = requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        
        assert delete_response.status_code == 403
        print("✓ Sub-broker correctly forbidden from deleting clients")


class TestClientSubBrokerLinking:
    """Test Client-SubBroker linking functionality"""
    
    @pytest.fixture
    def broker_token(self):
        return get_broker_token()
    
    @pytest.fixture
    def subbroker_token(self):
        return get_subbroker_token()
    
    def test_link_client_to_subbroker(self, broker_token):
        """Test linking a client to a sub-broker"""
        # First get list of partners
        partners_response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        partners = partners_response.json()
        
        if len(partners) == 0:
            pytest.skip("No partners available to test linking")
        
        partner_id = partners[0]["id"]
        
        # Create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Link_Client",
            "pan_number": pan,
            "email": "link@example.com",
            "mobile": "+919666666666"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Link client to sub-broker
        link_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/link-subbroker?subbroker_id={partner_id}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert link_response.status_code == 200
        assert "linked" in link_response.json().get("message", "").lower()
        
        # Verify link
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert get_response.json()["linked_subbroker_id"] == partner_id
        print(f"✓ Client linked to sub-broker: {partners[0]['name']}")
        return client_id
    
    def test_unlink_client_from_subbroker(self, broker_token):
        """Test unlinking a client from a sub-broker"""
        # First get list of partners
        partners_response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        partners = partners_response.json()
        
        if len(partners) == 0:
            pytest.skip("No partners available to test unlinking")
        
        partner_id = partners[0]["id"]
        
        # Create and link a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Unlink_Client",
            "pan_number": pan,
            "email": "unlink@example.com",
            "mobile": "+919777777777",
            "linked_subbroker_id": partner_id
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Unlink client
        unlink_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/unlink-subbroker",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert unlink_response.status_code == 200
        assert "unlinked" in unlink_response.json().get("message", "").lower()
        
        # Verify unlink
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert get_response.json()["linked_subbroker_id"] is None
        print("✓ Client unlinked from sub-broker")
    
    def test_subbroker_sees_only_linked_clients(self, broker_token, subbroker_token):
        """Test that sub-broker only sees clients linked to them"""
        # Get sub-broker's user ID from token
        # First, get the sub-broker's partner record
        partners_response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        partners = partners_response.json()
        
        # Find the partner with matching PAN
        subbroker_partner = None
        for p in partners:
            if p.get("pan") == SUB_BROKER_CREDENTIALS["pan"]:
                subbroker_partner = p
                break
        
        if not subbroker_partner:
            pytest.skip("Sub-broker partner not found")
        
        # Create a client linked to this sub-broker
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_SubBroker_Visible_Client",
            "pan_number": pan,
            "email": "visible@example.com",
            "mobile": "+919888888888",
            "linked_subbroker_id": subbroker_partner["id"]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Sub-broker should see this client
        subbroker_clients = requests.get(f"{BASE_URL}/api/clients", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        
        assert subbroker_clients.status_code == 200
        clients = subbroker_clients.json()
        client_ids = [c["id"] for c in clients]
        assert client_id in client_ids
        print("✓ Sub-broker can see linked clients")


class TestBondAllocation:
    """Test bond allocation to clients"""
    
    @pytest.fixture
    def broker_token(self):
        return get_broker_token()
    
    @pytest.fixture
    def test_bond_id(self, broker_token):
        """Get or create a test bond"""
        # Get existing bonds
        bonds_response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        bonds = bonds_response.json()
        
        # Find a bond with available units
        for bond in bonds:
            available = (bond.get("total_units", 1) - bond.get("units_sold", 0))
            if available > 0:
                return bond["id"]
        
        # Create a new bond if none available
        bond_data = {
            "name": "TEST_Allocation_Bond",
            "start_date": "2024-01-01",
            "end_date": "2026-12-31",
            "principal_amount": 1000000,
            "coupon_rate": 10.0,
            "primary_irr": 10.0,
            "secondary_irr": 9.5,
            "interest_payment_frequency": "quarterly",
            "total_units": 100,
            "units_sold": 0,
            "principal_payments": [{"date": "2026-12-31", "percentage": 100.0}],
            "interest_payments": [
                {"date": "2024-06-30", "amount": 25000},
                {"date": "2024-12-31", "amount": 25000},
                {"date": "2025-06-30", "amount": 25000},
                {"date": "2025-12-31", "amount": 25000},
                {"date": "2026-06-30", "amount": 25000},
                {"date": "2026-12-31", "amount": 25000}
            ]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/bonds", json=bond_data)
        return create_response.json()["id"]
    
    def test_allocate_bond_to_client(self, broker_token, test_bond_id):
        """Test allocating a bond to a client"""
        # Create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Allocation_Client",
            "pan_number": pan,
            "email": "allocation@example.com",
            "mobile": "+919999000001"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Allocate bond
        allocation_data = {
            "bond_id": test_bond_id,
            "units_blocked": 5,
            "units_paid": 0,
            "status": "blocked"
        }
        
        alloc_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allocate-bond",
            json=allocation_data,
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert alloc_response.status_code == 200
        assert "allocated" in alloc_response.json().get("message", "").lower()
        
        # Verify allocation
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        allocations = get_response.json().get("bond_allocations", [])
        assert len(allocations) > 0
        assert allocations[0]["bond_id"] == test_bond_id
        assert allocations[0]["units_blocked"] == 5
        assert allocations[0]["status"] == "blocked"
        print(f"✓ Bond allocated to client: {allocations[0]['units_blocked']} units blocked")
        return client_id
    
    def test_update_allocation_units_paid(self, broker_token, test_bond_id):
        """Test updating units paid for an allocation"""
        # Create a client and allocate bond
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Update_Allocation_Client",
            "pan_number": pan,
            "email": "update_alloc@example.com",
            "mobile": "+919999000002"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Allocate bond
        allocation_data = {
            "bond_id": test_bond_id,
            "units_blocked": 10,
            "units_paid": 0,
            "status": "blocked"
        }
        
        requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allocate-bond",
            json=allocation_data,
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Update units paid
        update_response = requests.put(
            f"{BASE_URL}/api/clients/{client_id}/allocations/{test_bond_id}?units_paid=5",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert update_response.status_code == 200
        assert update_response.json()["units_paid"] == 5
        
        # Verify status changed to partial_paid
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        allocations = get_response.json().get("bond_allocations", [])
        alloc = next((a for a in allocations if a["bond_id"] == test_bond_id), None)
        assert alloc is not None
        assert alloc["units_paid"] == 5
        assert alloc["status"] == "partial_paid"
        print("✓ Allocation updated: 5 units paid (partial_paid status)")
    
    def test_fully_paid_allocation(self, broker_token, test_bond_id):
        """Test fully paid allocation status"""
        # Create a client and allocate bond
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_FullyPaid_Client",
            "pan_number": pan,
            "email": "fullypaid@example.com",
            "mobile": "+919999000003"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Allocate bond
        allocation_data = {
            "bond_id": test_bond_id,
            "units_blocked": 3,
            "units_paid": 0,
            "status": "blocked"
        }
        
        requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allocate-bond",
            json=allocation_data,
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Update to fully paid
        update_response = requests.put(
            f"{BASE_URL}/api/clients/{client_id}/allocations/{test_bond_id}?units_paid=3",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert update_response.status_code == 200
        
        # Verify status changed to fully_paid
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        allocations = get_response.json().get("bond_allocations", [])
        alloc = next((a for a in allocations if a["bond_id"] == test_bond_id), None)
        assert alloc is not None
        assert alloc["units_paid"] == 3
        assert alloc["status"] == "fully_paid"
        print("✓ Allocation fully paid: status is fully_paid")
    
    def test_remove_bond_allocation(self, broker_token, test_bond_id):
        """Test removing a bond allocation from a client"""
        # Create a client and allocate bond
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Remove_Allocation_Client",
            "pan_number": pan,
            "email": "remove_alloc@example.com",
            "mobile": "+919999000004"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Allocate bond
        allocation_data = {
            "bond_id": test_bond_id,
            "units_blocked": 2,
            "units_paid": 0,
            "status": "blocked"
        }
        
        requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allocate-bond",
            json=allocation_data,
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        # Remove allocation
        remove_response = requests.delete(
            f"{BASE_URL}/api/clients/{client_id}/allocations/{test_bond_id}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert remove_response.status_code == 200
        
        # Verify allocation removed
        get_response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        allocations = get_response.json().get("bond_allocations", [])
        alloc = next((a for a in allocations if a["bond_id"] == test_bond_id), None)
        assert alloc is None
        print("✓ Bond allocation removed from client")
    
    def test_allocation_exceeds_available_units(self, broker_token, test_bond_id):
        """Test that allocation fails when exceeding available units"""
        # Create a client
        pan = generate_random_pan()
        client_data = {
            "name": "TEST_Exceed_Units_Client",
            "pan_number": pan,
            "email": "exceed@example.com",
            "mobile": "+919999000005"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        client_id = create_response.json()["id"]
        
        # Try to allocate more units than available
        allocation_data = {
            "bond_id": test_bond_id,
            "units_blocked": 999999,  # Very large number
            "units_paid": 0,
            "status": "blocked"
        }
        
        alloc_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allocate-bond",
            json=allocation_data,
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        
        assert alloc_response.status_code == 400
        assert "available" in alloc_response.json().get("detail", "").lower()
        print("✓ Allocation correctly rejected when exceeding available units")


class TestClientSearch:
    """Test client search functionality"""
    
    @pytest.fixture
    def broker_token(self):
        return get_broker_token()
    
    def test_search_by_name(self, broker_token):
        """Test that clients can be filtered by name (frontend search)"""
        # Create a client with unique name
        unique_name = f"TEST_SearchName_{random.randint(10000, 99999)}"
        pan = generate_random_pan()
        
        client_data = {
            "name": unique_name,
            "pan_number": pan,
            "email": "search@example.com",
            "mobile": "+919999000006"
        }
        
        requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        # Get all clients and verify the created one exists
        response = requests.get(f"{BASE_URL}/api/clients", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        
        clients = response.json()
        matching = [c for c in clients if unique_name in c["name"]]
        assert len(matching) > 0
        print(f"✓ Client searchable by name: {unique_name}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
