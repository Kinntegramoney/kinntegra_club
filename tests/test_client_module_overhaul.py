"""
Test suite for Client Module Overhaul
Tests the new 5-step wizard client creation with passport type selection,
conditional fields, dashboard notifications, and bulk upload templates.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


class TestAuthentication:
    """Test broker authentication for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        # Step 1: Login with PAN and password
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200, f"Login step 1 failed: {response.text}"
        temp_token = response.json().get("temp_token")
        
        # Step 2: Verify PIN
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200, f"Login step 2 failed: {response.text}"
        return response.json().get("token")
    
    def test_broker_login(self, broker_token):
        """Verify broker can login successfully"""
        assert broker_token is not None
        print(f"✓ Broker login successful")


class TestDashboardEndpoints:
    """Test dashboard notification endpoints"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_invalid_pan_endpoint(self, broker_token):
        """Test /api/clients/dashboard/invalid-pan endpoint"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.get(f"{BASE_URL}/api/clients/dashboard/invalid-pan", headers=headers)
        
        assert response.status_code == 200, f"Invalid PAN endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "invalid_pan_clients" in data, "Response should contain 'invalid_pan_clients'"
        assert "count" in data, "Response should contain 'count'"
        assert isinstance(data["invalid_pan_clients"], list), "invalid_pan_clients should be a list"
        assert isinstance(data["count"], int), "count should be an integer"
        
        print(f"✓ Invalid PAN endpoint works - Found {data['count']} clients with invalid PAN")
        
        # If there are invalid PANs, verify structure
        if data["count"] > 0:
            client = data["invalid_pan_clients"][0]
            assert "client_id" in client
            assert "client_name" in client
            assert "pan_number" in client
            print(f"  Sample invalid PAN: {client['pan_number']} for {client['client_name']}")
    
    def test_expiring_documents_endpoint(self, broker_token):
        """Test /api/clients/dashboard/expiring-documents endpoint"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.get(f"{BASE_URL}/api/clients/dashboard/expiring-documents", headers=headers)
        
        assert response.status_code == 200, f"Expiring documents endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "expiring_documents" in data, "Response should contain 'expiring_documents'"
        assert "count" in data, "Response should contain 'count'"
        assert isinstance(data["expiring_documents"], list), "expiring_documents should be a list"
        
        print(f"✓ Expiring documents endpoint works - Found {data['count']} expiring documents")
        
        # If there are expiring documents, verify structure
        if data["count"] > 0:
            doc = data["expiring_documents"][0]
            assert "client_id" in doc
            assert "client_name" in doc
            assert "document_type" in doc
            assert "expiry_date" in doc
            assert "days_until_expiry" in doc
            print(f"  Sample: {doc['client_name']}'s {doc['document_type']} expires in {doc['days_until_expiry']} days")


class TestMigrationEndpoint:
    """Test client migration endpoint"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_migrate_to_new_schema(self, broker_token):
        """Test /api/clients/migrate-to-new-schema endpoint"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.post(f"{BASE_URL}/api/clients/migrate-to-new-schema", headers=headers)
        
        assert response.status_code == 200, f"Migration endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data, "Response should contain 'message'"
        assert "migrated_clients" in data, "Response should contain 'migrated_clients'"
        assert "invalid_pan_clients" in data, "Response should contain 'invalid_pan_clients'"
        
        print(f"✓ Migration endpoint works - Migrated: {data['migrated_clients']}, Invalid PANs: {data['invalid_pan_clients']}")


class TestBulkUploadTemplates:
    """Test bulk upload template downloads"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_indian_client_template_download(self, broker_token):
        """Test /api/bulk/template/clients-indian endpoint"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.get(f"{BASE_URL}/api/bulk/template/clients-indian", headers=headers)
        
        assert response.status_code == 200, f"Indian template download failed: {response.text}"
        
        # Verify it's an Excel file
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type, \
            f"Expected Excel file, got: {content_type}"
        
        # Verify content disposition
        content_disposition = response.headers.get('content-disposition', '')
        assert 'indian' in content_disposition.lower() or 'attachment' in content_disposition.lower(), \
            f"Expected attachment with 'indian' in filename: {content_disposition}"
        
        # Verify file has content
        assert len(response.content) > 1000, "Template file seems too small"
        
        print(f"✓ Indian client template download works - Size: {len(response.content)} bytes")
    
    def test_foreign_client_template_download(self, broker_token):
        """Test /api/bulk/template/clients-foreign endpoint"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.get(f"{BASE_URL}/api/bulk/template/clients-foreign", headers=headers)
        
        assert response.status_code == 200, f"Foreign template download failed: {response.text}"
        
        # Verify it's an Excel file
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type, \
            f"Expected Excel file, got: {content_type}"
        
        # Verify file has content
        assert len(response.content) > 1000, "Template file seems too small"
        
        print(f"✓ Foreign client template download works - Size: {len(response.content)} bytes")


class TestClientCreation:
    """Test client creation with new schema"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_create_indian_passport_client_bonds(self, broker_token):
        """Test creating Indian passport holder with Bonds opportunity"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Generate unique PAN for test
        test_pan = f"TEST{uuid.uuid4().hex[:4].upper()}1A"
        
        client_data = {
            "name": "Test Indian Client Bonds",
            "email": f"test_indian_bonds_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543210",
            "country_of_residency": "India",
            "passport_type": "indian",
            "pan_number": test_pan,
            "opportunities": ["bonds"],
            "bank_name": "HDFC Bank",
            "account_number": "12345678901234",
            "ifsc_code": "HDFC0001234"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        data = response.json()
        
        # Verify response
        assert "id" in data, "Response should contain client id"
        assert "default_password" in data, "Response should contain default_password"
        assert "default_pin" in data, "Response should contain default_pin"
        
        print(f"✓ Indian passport client (Bonds) created successfully - ID: {data['id']}")
        
        # Cleanup - delete the test client
        delete_response = requests.delete(f"{BASE_URL}/api/clients/{data['id']}", headers=headers)
        print(f"  Cleanup: Client deleted - Status: {delete_response.status_code}")
    
    def test_create_indian_passport_client_real_estate(self, broker_token):
        """Test creating Indian passport holder with Real Estate opportunity"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Generate unique PAN for test
        test_pan = f"TEST{uuid.uuid4().hex[:4].upper()}2B"
        
        # Calculate passport dates
        valid_from = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        valid_until = (datetime.now() + timedelta(days=365*5)).strftime('%Y-%m-%d')
        
        client_data = {
            "name": "Test Indian Client Real Estate",
            "email": f"test_indian_re_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543211",
            "country_of_residency": "India",
            "passport_type": "indian",
            "pan_number": test_pan,
            "opportunities": ["real_estate"],
            "passport_valid_from": valid_from,
            "passport_valid_until": valid_until,
            "passport_country_of_issue": "India"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        data = response.json()
        
        print(f"✓ Indian passport client (Real Estate) created successfully - ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{data['id']}", headers=headers)
    
    def test_create_foreign_passport_client_uae(self, broker_token):
        """Test creating Foreign passport holder (UAE resident) with Real Estate"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Generate unique passport number for test
        test_passport = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        # Calculate passport dates
        valid_from = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        valid_until = (datetime.now() + timedelta(days=365*5)).strftime('%Y-%m-%d')
        
        client_data = {
            "name": "Test Foreign Client UAE",
            "email": f"test_foreign_uae_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+971501234567",
            "country_of_residency": "United Arab Emirates",
            "passport_type": "foreign",
            "passport_number": test_passport,
            "emirates_id": "784-1234-1234567-1",
            "opportunities": ["real_estate"],
            "passport_valid_from": valid_from,
            "passport_valid_until": valid_until,
            "passport_country_of_issue": "United States"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        data = response.json()
        
        print(f"✓ Foreign passport client (UAE) created successfully - ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{data['id']}", headers=headers)
    
    def test_create_foreign_passport_client_gift_city(self, broker_token):
        """Test creating Foreign passport holder with GIFT City opportunity"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Generate unique passport number for test
        test_passport = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        client_data = {
            "name": "Test Foreign Client GIFT City",
            "email": f"test_foreign_gift_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+447123456789",
            "country_of_residency": "United Kingdom",
            "passport_type": "foreign",
            "passport_number": test_passport,
            "opportunities": ["gift_city"]
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        data = response.json()
        
        print(f"✓ Foreign passport client (GIFT City) created successfully - ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{data['id']}", headers=headers)


class TestClientCreationValidation:
    """Test validation rules for client creation"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_indian_passport_requires_pan(self, broker_token):
        """Test that Indian passport holders require PAN"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        client_data = {
            "name": "Test No PAN",
            "email": f"test_no_pan_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543210",
            "country_of_residency": "India",
            "passport_type": "indian",
            # Missing pan_number
            "opportunities": ["bonds"],
            "bank_name": "HDFC Bank",
            "account_number": "12345678901234",
            "ifsc_code": "HDFC0001234"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 400, f"Should fail without PAN: {response.text}"
        assert "PAN" in response.text.upper(), "Error should mention PAN"
        
        print(f"✓ Validation works: Indian passport requires PAN")
    
    def test_foreign_passport_requires_passport_number(self, broker_token):
        """Test that Foreign passport holders require passport number"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        client_data = {
            "name": "Test No Passport",
            "email": f"test_no_passport_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+971501234567",
            "country_of_residency": "United Arab Emirates",
            "passport_type": "foreign",
            # Missing passport_number
            "opportunities": ["real_estate"]
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 400, f"Should fail without passport number: {response.text}"
        assert "passport" in response.text.lower(), "Error should mention passport"
        
        print(f"✓ Validation works: Foreign passport requires passport number")
    
    def test_bonds_requires_bank_details(self, broker_token):
        """Test that Bonds opportunity requires bank details"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        test_pan = f"TEST{uuid.uuid4().hex[:4].upper()}3C"
        
        client_data = {
            "name": "Test No Bank",
            "email": f"test_no_bank_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543210",
            "country_of_residency": "India",
            "passport_type": "indian",
            "pan_number": test_pan,
            "opportunities": ["bonds"]
            # Missing bank details
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 400, f"Should fail without bank details: {response.text}"
        assert "bank" in response.text.lower(), "Error should mention bank"
        
        print(f"✓ Validation works: Bonds requires bank details")
    
    def test_invalid_passport_type(self, broker_token):
        """Test that invalid passport type is rejected"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        client_data = {
            "name": "Test Invalid Type",
            "email": f"test_invalid_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543210",
            "country_of_residency": "India",
            "passport_type": "invalid_type",  # Invalid
            "pan_number": "ABCDE1234F",
            "opportunities": ["bonds"]
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 400, f"Should fail with invalid passport type: {response.text}"
        
        print(f"✓ Validation works: Invalid passport type rejected")
    
    def test_indian_cannot_select_gift_city(self, broker_token):
        """Test that Indian passport holders cannot select GIFT City"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        test_pan = f"TEST{uuid.uuid4().hex[:4].upper()}4D"
        
        client_data = {
            "name": "Test Invalid Opportunity",
            "email": f"test_invalid_opp_{uuid.uuid4().hex[:6]}@test.com",
            "mobile": "+919876543210",
            "country_of_residency": "India",
            "passport_type": "indian",
            "pan_number": test_pan,
            "opportunities": ["gift_city"]  # Invalid for Indian
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        
        assert response.status_code == 400, f"Should fail with invalid opportunity: {response.text}"
        
        print(f"✓ Validation works: Indian cannot select GIFT City")


class TestClientsList:
    """Test clients list endpoint"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = response.json().get("temp_token")
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return response.json().get("token")
    
    def test_get_clients_list(self, broker_token):
        """Test getting list of clients"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        
        assert response.status_code == 200, f"Get clients failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Clients list endpoint works - Found {len(data)} clients")
        
        # Check if clients have new schema fields
        if len(data) > 0:
            client = data[0]
            # Check for new fields (may not exist for all clients)
            has_passport_type = 'passport_type' in client
            has_opportunities = 'opportunities' in client
            print(f"  Sample client has passport_type: {has_passport_type}, opportunities: {has_opportunities}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
