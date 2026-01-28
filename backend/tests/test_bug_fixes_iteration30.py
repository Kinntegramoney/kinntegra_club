"""
Test cases for Bug Fixes - Iteration 30
1. Resend Credentials - verify response does NOT contain password
2. Holdings Excel Download - verify Investment column shows correct amounts
3. Holdings Email - verify Excel attachment is included
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test client with holdings
TEST_CLIENT_ID = "a7bfda77-8fb6-4c6f-b2c8-a0991058909c"  # Edna Miranda Souza

# Broker credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


class TestAuthentication:
    """Authentication tests for broker login"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert step1_response.status_code == 200, f"Step 1 failed: {step1_response.text}"
        temp_token = step1_response.json().get("temp_token")
        assert temp_token, "No temp_token in step 1 response"
        
        # Step 2: Verify PIN
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert step2_response.status_code == 200, f"Step 2 failed: {step2_response.text}"
        token = step2_response.json().get("token")
        assert token, "No token in step 2 response"
        
        return token
    
    def test_broker_login_success(self, broker_token):
        """Verify broker can login successfully"""
        assert broker_token is not None
        assert len(broker_token) > 0


class TestResendCredentials:
    """Test resend-credentials endpoint - SECURITY FIX"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return step2_response.json().get("token")
    
    def test_resend_credentials_no_password_in_response(self, broker_token):
        """
        CRITICAL SECURITY TEST: Verify resend-credentials response does NOT contain password or PIN
        Bug Fix: Previously credentials were shown on screen - now only sent via email
        """
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Get a client to test with
        clients_response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        assert clients_response.status_code == 200
        clients = clients_response.json()
        
        # Find a client with email
        test_client = None
        for client in clients:
            if client.get('email'):
                test_client = client
                break
        
        if not test_client:
            pytest.skip("No client with email found for testing")
        
        # Call resend-credentials endpoint
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client['id']}/resend-credentials",
            headers=headers
        )
        
        # Should succeed
        assert response.status_code == 200, f"Resend credentials failed: {response.text}"
        
        data = response.json()
        
        # CRITICAL: Verify NO password or PIN in response
        assert "password" not in data, "SECURITY BUG: Password found in response!"
        assert "pin" not in data, "SECURITY BUG: PIN found in response!"
        assert "new_password" not in data, "SECURITY BUG: new_password found in response!"
        assert "new_pin" not in data, "SECURITY BUG: new_pin found in response!"
        assert "credentials" not in data, "SECURITY BUG: credentials found in response!"
        
        # Verify expected fields ARE present
        assert "message" in data, "Missing 'message' field in response"
        assert "email_sent" in data, "Missing 'email_sent' field in response"
        assert "client_email" in data, "Missing 'client_email' field in response"
        
        # Verify email was sent
        assert data["email_sent"] == True, "Email was not sent"
        
        print(f"✓ Resend credentials response is secure: {data}")
    
    def test_resend_credentials_response_structure(self, broker_token):
        """Verify the response structure is correct"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        clients_response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        clients = clients_response.json()
        
        test_client = None
        for client in clients:
            if client.get('email'):
                test_client = client
                break
        
        if not test_client:
            pytest.skip("No client with email found")
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client['id']}/resend-credentials",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response has only expected keys
        expected_keys = {"message", "email_sent", "client_email"}
        actual_keys = set(data.keys())
        
        # Should not have any extra keys that might contain sensitive data
        extra_keys = actual_keys - expected_keys
        sensitive_keywords = ["password", "pin", "secret", "credential", "hash"]
        
        for key in extra_keys:
            for keyword in sensitive_keywords:
                assert keyword not in key.lower(), f"Potentially sensitive key found: {key}"


class TestHoldingsExcelDownload:
    """Test Holdings Excel Download - Investment column fix"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return step2_response.json().get("token")
    
    def test_holdings_api_returns_invested_amount(self, broker_token):
        """Verify holdings API returns correct invested_amount (not ₹0)"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        # Get holdings for test client
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Holdings API failed: {response.text}"
        
        data = response.json()
        assert "holdings" in data, "No holdings in response"
        
        # Check that at least one holding has invested_amount > 0
        holdings = data["holdings"]
        assert len(holdings) > 0, "No holdings found for test client"
        
        total_invested = 0
        for holding in holdings:
            invested = holding.get('invested_amount', 0)
            total_invested += invested
            print(f"Holding: {holding.get('bond_name', 'Unknown')} - Invested: ₹{invested:,.2f}")
        
        # Verify total investment is not zero
        assert total_invested > 0, f"BUG: Total invested amount is ₹0! Expected ~₹15,042,010"
        
        # Verify summary also has correct total
        summary = data.get('summary', {})
        summary_total = summary.get('total_investment', 0)
        assert summary_total > 0, f"BUG: Summary total_investment is ₹0!"
        
        print(f"✓ Total invested amount: ₹{total_invested:,.2f}")
        print(f"✓ Summary total_investment: ₹{summary_total:,.2f}")
    
    def test_holdings_excel_download(self, broker_token):
        """Verify Excel download endpoint works and returns valid Excel file"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}/download",
            headers=headers
        )
        
        assert response.status_code == 200, f"Excel download failed: {response.text}"
        
        # Verify content type is Excel
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type, \
            f"Unexpected content type: {content_type}"
        
        # Verify we got actual content
        assert len(response.content) > 0, "Excel file is empty"
        
        # Verify it's a valid Excel file (starts with PK for xlsx)
        assert response.content[:2] == b'PK', "Response is not a valid Excel file"
        
        print(f"✓ Excel download successful, file size: {len(response.content)} bytes")


class TestHoldingsEmailWithAttachment:
    """Test Holdings Email - Excel attachment fix"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return step2_response.json().get("token")
    
    def test_send_holdings_report_email(self, broker_token):
        """Verify holdings report email is sent with Excel attachment"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}/send-report-email",
            headers=headers
        )
        
        assert response.status_code == 200, f"Send email failed: {response.text}"
        
        data = response.json()
        
        # Verify success
        assert data.get("success") == True, "Email send was not successful"
        
        # Verify attachment info is in response
        assert "attachment" in data, "No attachment info in response"
        assert data["attachment"].endswith(".xlsx"), "Attachment should be an Excel file"
        
        # Verify message mentions attachment
        message = data.get("message", "")
        assert "Excel attachment" in message or "attachment" in message.lower(), \
            f"Message should mention attachment: {message}"
        
        print(f"✓ Email sent successfully with attachment: {data.get('attachment')}")
        print(f"✓ Recipient: {data.get('recipient')}")
        if data.get('cc'):
            print(f"✓ CC: {data.get('cc')}")


class TestResetPassword:
    """Test reset-password endpoint - should also not expose credentials"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        return step2_response.json().get("token")
    
    def test_reset_password_no_credentials_in_response(self, broker_token):
        """Verify reset-password response does NOT contain password"""
        headers = {"Authorization": f"Bearer {broker_token}"}
        
        clients_response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        clients = clients_response.json()
        
        test_client = None
        for client in clients:
            if client.get('email'):
                test_client = client
                break
        
        if not test_client:
            pytest.skip("No client with email found")
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client['id']}/reset-password",
            headers=headers
        )
        
        assert response.status_code == 200, f"Reset password failed: {response.text}"
        
        data = response.json()
        
        # CRITICAL: Verify NO password in response
        assert "password" not in data, "SECURITY BUG: Password found in response!"
        assert "new_password" not in data, "SECURITY BUG: new_password found in response!"
        
        print(f"✓ Reset password response is secure: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
