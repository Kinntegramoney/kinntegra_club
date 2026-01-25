"""
Test Holdings Features - EMAIL button, Email Sync, Historical Upload
Tests the new features added to the Holdings page:
1. EMAIL button - sends holdings report to client with sub-broker CC
2. Email Sync - triggers /api/email-reader/process to sync repayments from emails
3. Historical Upload - uploads historical transactions that merge/update existing data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"
TEST_CLIENT_ID = "client-AAAPU0926D"


class TestAuthentication:
    """Test two-step authentication flow"""
    
    def test_login_step1_success(self):
        """Test step 1 login with PAN and password"""
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "temp_token" in data
        assert len(data["temp_token"]) > 0
    
    def test_login_step2_success(self):
        """Test step 2 login with PIN"""
        # Step 1
        step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": BROKER_PAN,
            "password": BROKER_PASSWORD
        })
        temp_token = step1_response.json()["temp_token"]
        
        # Step 2
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": BROKER_PIN
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "broker"


@pytest.fixture
def auth_token():
    """Get authentication token for broker"""
    step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": BROKER_PAN,
        "password": BROKER_PASSWORD
    })
    temp_token = step1_response.json()["temp_token"]
    
    step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": BROKER_PIN
    })
    return step2_response.json()["token"]


class TestHoldingsClients:
    """Test holdings clients list"""
    
    def test_get_holdings_clients(self, auth_token):
        """Test getting list of clients with holdings"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/clients",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Should have at least one client (Fali Investor)
        assert len(data) >= 1
        
        # Check client structure
        client = data[0]
        assert "id" in client
        assert "name" in client
        assert "pan_number" in client


class TestEmailHoldingsReport:
    """Test EMAIL button functionality - sends holdings report to client"""
    
    def test_send_holdings_report_email_success(self, auth_token):
        """Test sending holdings report email to client"""
        response = requests.post(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}/send-report-email",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["success"] == True
        assert "message" in data
        assert "recipient" in data
        assert "Holdings report sent" in data["message"]
        
        # Verify email was sent to client
        assert "@" in data["recipient"]
    
    def test_send_holdings_report_email_invalid_client(self, auth_token):
        """Test sending email to non-existent client"""
        response = requests.post(
            f"{BASE_URL}/api/holdings/client/invalid-client-id/send-report-email",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()
    
    def test_send_holdings_report_email_unauthorized(self):
        """Test sending email without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}/send-report-email"
        )
        assert response.status_code in [401, 403]


class TestEmailSync:
    """Test Email Sync functionality - syncs repayments from email inbox"""
    
    def test_email_sync_process(self, auth_token):
        """Test email sync endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/email-reader/process?days_back=7",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total_emails" in data
        assert "processed" in data
        assert "matched" in data
        assert "errors" in data
        
        # Values should be non-negative
        assert data["total_emails"] >= 0
        assert data["processed"] >= 0
        assert data["matched"] >= 0
    
    def test_email_sync_with_different_days_back(self, auth_token):
        """Test email sync with different days_back parameter"""
        response = requests.post(
            f"{BASE_URL}/api/email-reader/process?days_back=30",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_emails" in data
    
    def test_email_sync_unauthorized(self):
        """Test email sync without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/email-reader/process?days_back=7"
        )
        assert response.status_code in [401, 403]
    
    def test_email_connection_test(self, auth_token):
        """Test email connection test endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/email-reader/test-connection",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Should return 200 even if connection fails (returns error in body)
        assert response.status_code == 200
        data = response.json()
        assert "success" in data or "error" in data


class TestHistoricalUpload:
    """Test Historical Upload functionality - uploads historical transactions"""
    
    def test_historical_trades_template_download(self, auth_token):
        """Test downloading historical trades template"""
        response = requests.get(
            f"{BASE_URL}/api/bulk/template/historical-trades",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Should return Excel file
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "octet-stream" in content_type
        
        # Should have content
        assert len(response.content) > 0
    
    def test_historical_trades_upload_empty_file(self, auth_token):
        """Test uploading empty/invalid file"""
        # Create a minimal invalid file
        files = {"file": ("test.xlsx", b"invalid content", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        
        response = requests.post(
            f"{BASE_URL}/api/bulk/historical-trades",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        # Should return 400 or 422 for invalid file
        assert response.status_code in [400, 422, 500]
    
    def test_historical_trades_upload_unauthorized(self):
        """Test uploading without authentication"""
        files = {"file": ("test.xlsx", b"content", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        
        response = requests.post(
            f"{BASE_URL}/api/bulk/historical-trades",
            files=files
        )
        assert response.status_code in [401, 403]


class TestHoldingsData:
    """Test holdings data retrieval"""
    
    def test_get_client_holdings(self, auth_token):
        """Test getting holdings for a specific client"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/{TEST_CLIENT_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "holdings" in data
        assert "summary" in data
        
        # Check holdings structure
        if len(data["holdings"]) > 0:
            holding = data["holdings"][0]
            assert "bond_id" in holding
            assert "bond_name" in holding
            assert "units" in holding
            assert "invested_amount" in holding
    
    def test_get_client_holdings_invalid_client(self, auth_token):
        """Test getting holdings for non-existent client"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/invalid-client-id",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Should return 404 or empty holdings
        assert response.status_code in [200, 404]


class TestEmailPreview:
    """Test email preview functionality"""
    
    def test_email_preview(self, auth_token):
        """Test previewing repayment emails"""
        response = requests.get(
            f"{BASE_URL}/api/email-reader/preview?days_back=7",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "total_emails" in data
        assert "emails" in data
        assert isinstance(data["emails"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
