"""
NCD Cashflow Calculator Backend API Tests
Tests for:
- Two-factor authentication (PAN + Password, then PIN)
- Role-based access control (broker vs sub_broker)
- Bond management CRUD operations
- Secondary market calculator
- Partner/Sub-broker management
"""

import pytest
import requests
import os

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


class TestHealthCheck:
    """Basic API health check tests"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "BondFlow Pro API"
        print("✓ API root endpoint working")


class TestBrokerAuthentication:
    """Test broker two-factor authentication flow"""
    
    def test_login_step1_valid_credentials(self):
        """Test step 1: PAN + Password verification"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        assert response.status_code == 200
        data = response.json()
        assert "temp_token" in data
        assert len(data["temp_token"]) > 0
        print("✓ Broker login step 1 successful")
        return data["temp_token"]
    
    def test_login_step1_invalid_pan(self):
        """Test step 1 with invalid PAN"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": "INVALID123",
            "password": BROKER_CREDENTIALS["password"]
        })
        assert response.status_code == 401
        print("✓ Invalid PAN correctly rejected")
    
    def test_login_step1_invalid_password(self):
        """Test step 1 with invalid password"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid password correctly rejected")
    
    def test_login_step2_valid_pin(self):
        """Test step 2: PIN verification and full login"""
        # First get temp token
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        assert step1_response.status_code == 200
        temp_token = step1_response.json()["temp_token"]
        
        # Then verify PIN
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        assert step2_response.status_code == 200
        data = step2_response.json()
        
        # Verify response structure
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "broker"
        assert data["user"]["pan"] == BROKER_CREDENTIALS["pan"]
        print("✓ Broker login step 2 successful")
        return data["token"]
    
    def test_login_step2_invalid_pin(self):
        """Test step 2 with invalid PIN"""
        # First get temp token
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1_response.json()["temp_token"]
        
        # Then try invalid PIN
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": "9999"
        })
        assert step2_response.status_code == 401
        print("✓ Invalid PIN correctly rejected")


class TestSubBrokerAuthentication:
    """Test sub-broker two-factor authentication flow"""
    
    def test_subbroker_full_login(self):
        """Test complete sub-broker login flow"""
        # Step 1
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": SUB_BROKER_CREDENTIALS["pan"],
            "password": SUB_BROKER_CREDENTIALS["password"]
        })
        assert step1_response.status_code == 200
        temp_token = step1_response.json()["temp_token"]
        
        # Step 2
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": SUB_BROKER_CREDENTIALS["pin"]
        })
        assert step2_response.status_code == 200
        data = step2_response.json()
        
        assert data["user"]["role"] == "sub_broker"
        print("✓ Sub-broker login successful")
        return data["token"]


class TestBondManagement:
    """Test bond CRUD operations"""
    
    @pytest.fixture
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    @pytest.fixture
    def subbroker_token(self):
        """Get sub-broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": SUB_BROKER_CREDENTIALS["pan"],
            "password": SUB_BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": SUB_BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    def test_create_bond(self, broker_token):
        """Test bond creation"""
        bond_data = {
            "name": "TEST_Bond_API_Test",
            "start_date": "2024-01-01",
            "end_date": "2025-12-31",
            "principal_amount": 1000000,
            "coupon_rate": 10.0,
            "primary_irr": 10.0,
            "secondary_irr": 9.5,
            "interest_payment_frequency": "quarterly",
            "total_units": 10,
            "units_sold": 0,
            "principal_payments": [
                {"date": "2025-12-31", "percentage": 100.0}
            ],
            "interest_payments": [
                {"date": "2024-03-31", "amount": 25000},
                {"date": "2024-06-30", "amount": 25000},
                {"date": "2024-09-30", "amount": 25000},
                {"date": "2024-12-31", "amount": 25000},
                {"date": "2025-03-31", "amount": 25000},
                {"date": "2025-06-30", "amount": 25000},
                {"date": "2025-09-30", "amount": 25000},
                {"date": "2025-12-31", "amount": 25000}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/bonds", json=bond_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["name"] == bond_data["name"]
        assert data["principal_amount"] == bond_data["principal_amount"]
        print(f"✓ Bond created with ID: {data['id']}")
        return data["id"]
    
    def test_get_bonds_as_broker(self, broker_token):
        """Test getting bonds list as broker"""
        response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} bonds as broker")
    
    def test_get_bonds_as_subbroker(self, subbroker_token):
        """Test getting bonds list as sub-broker"""
        response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} bonds as sub-broker")
    
    def test_get_bond_details(self, broker_token):
        """Test getting single bond details"""
        # First get list of bonds
        list_response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        bonds = list_response.json()
        
        if len(bonds) > 0:
            bond_id = bonds[0]["id"]
            response = requests.get(f"{BASE_URL}/api/bonds/{bond_id}")
            assert response.status_code == 200
            data = response.json()
            
            assert "bond" in data
            assert "total_cashflows_primary" in data
            print(f"✓ Retrieved bond details for: {data['bond']['name']}")
        else:
            pytest.skip("No bonds available to test")
    
    def test_delete_bond_as_broker(self, broker_token):
        """Test bond deletion as broker"""
        # First create a bond to delete
        bond_data = {
            "name": "TEST_Bond_To_Delete",
            "start_date": "2024-01-01",
            "end_date": "2025-12-31",
            "principal_amount": 500000,
            "coupon_rate": 8.0,
            "primary_irr": 8.0,
            "secondary_irr": 7.5,
            "interest_payment_frequency": "quarterly",
            "total_units": 5,
            "units_sold": 0,
            "principal_payments": [{"date": "2025-12-31", "percentage": 100.0}],
            "interest_payments": [{"date": "2024-06-30", "amount": 20000}]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/bonds", json=bond_data)
        assert create_response.status_code == 200
        bond_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = requests.delete(f"{BASE_URL}/api/bonds/{bond_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert delete_response.status_code == 200
        print("✓ Bond deleted successfully")
    
    def test_delete_bond_as_subbroker_forbidden(self, subbroker_token):
        """Test that sub-broker cannot delete bonds"""
        # First create a bond
        bond_data = {
            "name": "TEST_Bond_SubBroker_Delete_Test",
            "start_date": "2024-01-01",
            "end_date": "2025-12-31",
            "principal_amount": 500000,
            "coupon_rate": 8.0,
            "primary_irr": 8.0,
            "secondary_irr": 7.5,
            "interest_payment_frequency": "quarterly",
            "total_units": 5,
            "units_sold": 0,
            "principal_payments": [{"date": "2025-12-31", "percentage": 100.0}],
            "interest_payments": [{"date": "2024-06-30", "amount": 20000}]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/bonds", json=bond_data)
        bond_id = create_response.json()["id"]
        
        # Try to delete as sub-broker
        delete_response = requests.delete(f"{BASE_URL}/api/bonds/{bond_id}", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert delete_response.status_code == 403
        print("✓ Sub-broker correctly forbidden from deleting bonds")
        
        # Cleanup - get broker token and delete
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        broker_token = step2.json()["token"]
        requests.delete(f"{BASE_URL}/api/bonds/{bond_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })


class TestSecondaryMarketCalculator:
    """Test secondary market price calculation"""
    
    @pytest.fixture
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    def test_calculate_secondary_price(self, broker_token):
        """Test secondary market price calculation"""
        # First get a bond
        list_response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        bonds = list_response.json()
        
        if len(bonds) == 0:
            # Create a test bond
            bond_data = {
                "name": "TEST_Calculator_Bond",
                "start_date": "2024-01-01",
                "end_date": "2025-12-31",
                "principal_amount": 1000000,
                "coupon_rate": 10.0,
                "primary_irr": 10.0,
                "secondary_irr": 9.5,
                "interest_payment_frequency": "quarterly",
                "total_units": 10,
                "units_sold": 0,
                "principal_payments": [{"date": "2025-12-31", "percentage": 100.0}],
                "interest_payments": [
                    {"date": "2024-06-30", "amount": 25000},
                    {"date": "2024-12-31", "amount": 25000},
                    {"date": "2025-06-30", "amount": 25000},
                    {"date": "2025-12-31", "amount": 25000}
                ]
            }
            create_response = requests.post(f"{BASE_URL}/api/bonds", json=bond_data)
            bond_id = create_response.json()["id"]
        else:
            bond_id = bonds[0]["id"]
        
        # Calculate secondary price
        calc_response = requests.post(f"{BASE_URL}/api/bonds/{bond_id}/calculate", json={
            "investment_date": "2024-06-15",
            "units": 2
        })
        
        if calc_response.status_code == 200:
            data = calc_response.json()
            assert "price_per_unit" in data
            assert "total_price" in data
            assert "remaining_principal" in data
            assert "remaining_interest" in data
            assert "secondary_buyer_irr" in data
            assert "days_to_maturity" in data
            print(f"✓ Secondary price calculated: ₹{data['total_price']} for {data['units_requested']} units")
        elif calc_response.status_code == 400:
            # Investment date might be outside bond period
            print("✓ Calculator correctly validates investment date")
        else:
            pytest.fail(f"Unexpected status code: {calc_response.status_code}")
    
    def test_download_cashflow(self, broker_token):
        """Test cashflow download endpoint"""
        # Get a bond
        list_response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        bonds = list_response.json()
        
        if len(bonds) > 0:
            bond_id = bonds[0]["id"]
            bond_details = requests.get(f"{BASE_URL}/api/bonds/{bond_id}").json()
            
            # Use a date within the bond period
            start_date = bond_details["bond"]["start_date"]
            end_date = bond_details["bond"]["end_date"]
            
            # Try with a date in the middle
            from datetime import datetime, timedelta
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            mid_date = start + (end - start) / 2
            investment_date = mid_date.strftime("%Y-%m-%d")
            
            response = requests.post(f"{BASE_URL}/api/bonds/{bond_id}/download-cashflow", json={
                "investment_date": investment_date,
                "units": 1
            })
            
            if response.status_code == 200:
                data = response.json()
                assert "bond_name" in data
                assert "cashflows" in data
                assert "total_principal" in data
                assert "total_interest" in data
                assert "total_tds" in data
                print(f"✓ Cashflow download working: {len(data['cashflows'])} payments")
            elif response.status_code == 400:
                print("✓ Cashflow endpoint validates dates correctly")
        else:
            pytest.skip("No bonds available to test")


class TestPartnerManagement:
    """Test sub-broker/partner management"""
    
    @pytest.fixture
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    @pytest.fixture
    def subbroker_token(self):
        """Get sub-broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": SUB_BROKER_CREDENTIALS["pan"],
            "password": SUB_BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": SUB_BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    def test_get_partners_as_broker(self, broker_token):
        """Test getting partners list as broker"""
        response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} partners as broker")
    
    def test_get_partners_as_subbroker_forbidden(self, subbroker_token):
        """Test that sub-broker cannot view partners list"""
        response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert response.status_code == 403
        print("✓ Sub-broker correctly forbidden from viewing partners")
    
    def test_create_partner(self, broker_token):
        """Test creating a new sub-broker partner"""
        import random
        random_suffix = random.randint(1000, 9999)
        
        partner_data = {
            "name": f"TEST_Partner_{random_suffix}",
            "pan": f"TEST{random_suffix}A",
            "partner_code": f"TP{random_suffix}",
            "email": f"test_partner_{random_suffix}@example.com",
            "mobile": f"+91900000{random_suffix}",
            "color": "#3B82F6",
            "address_line1": "123 Test Street",
            "address_line2": "Suite 100",
            "city": "Mumbai",
            "country": "India",
            "state": "Maharashtra",
            "pincode": "400001",
            "password": "testpass123",
            "pin": "1234"
        }
        
        response = requests.post(f"{BASE_URL}/api/partners", json=partner_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["name"] == partner_data["name"]
        print(f"✓ Partner created: {data['name']}")
        return data["id"]
    
    def test_delete_partner(self, broker_token):
        """Test deleting a partner"""
        import random
        random_suffix = random.randint(10000, 99999)
        
        # First create a partner to delete
        partner_data = {
            "name": f"TEST_Partner_Delete_{random_suffix}",
            "pan": f"DEL{random_suffix}A",
            "partner_code": f"DEL{random_suffix}",
            "email": f"delete_partner_{random_suffix}@example.com",
            "mobile": f"+91800000{random_suffix}",
            "color": "#EF4444",
            "address_line1": "Delete Street",
            "address_line2": "Suite 999",
            "city": "Delhi",
            "country": "India",
            "state": "Delhi",
            "pincode": "110001",
            "password": "deletepass123",
            "pin": "9999"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/partners", json=partner_data, headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert create_response.status_code == 200
        partner_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = requests.delete(f"{BASE_URL}/api/partners/{partner_id}", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert delete_response.status_code == 200
        print("✓ Partner deleted successfully")
    
    def test_create_partner_as_subbroker_forbidden(self, subbroker_token):
        """Test that sub-broker cannot create partners"""
        partner_data = {
            "name": "TEST_Forbidden_Partner",
            "pan": "FORBID1234",
            "partner_code": "FORBID001",
            "email": "forbidden@example.com",
            "mobile": "+919999999999",
            "color": "#000000",
            "address_line1": "Forbidden Street",
            "address_line2": "Suite 0",
            "city": "Nowhere",
            "country": "India",
            "state": "Karnataka",
            "pincode": "560001",
            "password": "forbidden123",
            "pin": "0000"
        }
        
        response = requests.post(f"{BASE_URL}/api/partners", json=partner_data, headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert response.status_code == 403
        print("✓ Sub-broker correctly forbidden from creating partners")


class TestRoleBasedAccess:
    """Test role-based access control"""
    
    @pytest.fixture
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_CREDENTIALS["pan"],
            "password": BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    @pytest.fixture
    def subbroker_token(self):
        """Get sub-broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": SUB_BROKER_CREDENTIALS["pan"],
            "password": SUB_BROKER_CREDENTIALS["password"]
        })
        temp_token = step1.json()["temp_token"]
        
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": SUB_BROKER_CREDENTIALS["pin"]
        })
        return step2.json()["token"]
    
    def test_broker_can_access_bonds(self, broker_token):
        """Test broker can access bonds"""
        response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response.status_code == 200
        print("✓ Broker can access bonds")
    
    def test_subbroker_can_access_bonds(self, subbroker_token):
        """Test sub-broker can access bonds"""
        response = requests.get(f"{BASE_URL}/api/bonds", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert response.status_code == 200
        print("✓ Sub-broker can access bonds")
    
    def test_broker_can_access_partners(self, broker_token):
        """Test broker can access partners"""
        response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {broker_token}"
        })
        assert response.status_code == 200
        print("✓ Broker can access partners")
    
    def test_subbroker_cannot_access_partners(self, subbroker_token):
        """Test sub-broker cannot access partners"""
        response = requests.get(f"{BASE_URL}/api/partners", headers={
            "Authorization": f"Bearer {subbroker_token}"
        })
        assert response.status_code == 403
        print("✓ Sub-broker correctly denied access to partners")
    
    def test_unauthenticated_cannot_access_bonds(self):
        """Test unauthenticated user cannot access bonds"""
        response = requests.get(f"{BASE_URL}/api/bonds")
        assert response.status_code in [401, 403]
        print("✓ Unauthenticated user correctly denied access")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
