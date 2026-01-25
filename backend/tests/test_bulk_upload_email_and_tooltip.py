"""
Test file for verifying:
1. Bulk upload clients endpoint sends welcome emails
2. Holdings tooltip format for negative differences
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBulkUploadEmailFeature:
    """Tests for bulk upload clients with welcome email sending"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self):
        """Get authentication token using two-step login"""
        # Step 1: PAN + Password
        step1_response = self.session.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": "ANVPB5297J",
            "password": "Laksh@0208"
        })
        if step1_response.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_response.text}")
        
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: PIN verification
        step2_response = self.session.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": "0516"
        })
        if step2_response.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_response.text}")
        
        return step2_response.json().get("token")
    
    def test_bulk_clients_endpoint_exists(self):
        """Test that /api/bulk/clients endpoint exists"""
        token = self.get_auth_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access the endpoint without file (should return 422 - validation error, not 404)
        response = self.session.post(f"{BASE_URL}/api/bulk/clients")
        
        # 422 means endpoint exists but requires file
        # 404 would mean endpoint doesn't exist
        assert response.status_code in [422, 400], f"Expected 422 or 400, got {response.status_code}: {response.text}"
        print(f"✓ /api/bulk/clients endpoint exists (returns {response.status_code} without file)")
    
    def test_clients_bulk_upload_endpoint_exists(self):
        """Test that /api/clients/bulk-upload endpoint exists"""
        token = self.get_auth_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access the endpoint without file
        response = self.session.post(f"{BASE_URL}/api/clients/bulk-upload")
        
        assert response.status_code in [422, 400], f"Expected 422 or 400, got {response.status_code}: {response.text}"
        print(f"✓ /api/clients/bulk-upload endpoint exists (returns {response.status_code} without file)")


class TestCodeVerification:
    """Code verification tests - checking that the code changes are in place"""
    
    def test_bulk_upload_clients_has_send_welcome_email_call(self):
        """Verify that bulk_upload_clients function includes send_welcome_email_client call"""
        server_file = "/app/backend/server.py"
        
        with open(server_file, 'r') as f:
            content = f.read()
        
        # Find the bulk_upload_clients function at line ~4200-4340
        # Check for send_welcome_email_client call within that function
        
        # Pattern to find send_welcome_email_client call with proper parameters
        email_call_pattern = r'send_welcome_email_client\s*\(\s*client_name\s*=.*?,\s*client_email\s*=.*?,\s*pan\s*=.*?,\s*password\s*=.*?,\s*pin\s*=.*?,\s*broker_name\s*='
        
        matches = re.findall(email_call_pattern, content, re.DOTALL)
        
        assert len(matches) > 0, "send_welcome_email_client call not found in server.py"
        print(f"✓ Found {len(matches)} send_welcome_email_client call(s) in server.py")
        
        # Verify the call is within bulk upload context (check for email condition)
        email_condition_pattern = r'if email:\s*try:\s*send_welcome_email_client'
        condition_matches = re.findall(email_condition_pattern, content, re.DOTALL)
        
        assert len(condition_matches) > 0, "send_welcome_email_client should be called conditionally when email is provided"
        print(f"✓ Email sending is conditional on email being provided")
    
    def test_holdings_tooltip_format_correct(self):
        """Verify that Holdings.jsx has the correct tooltip format"""
        holdings_file = "/app/frontend/src/pages/Holdings.jsx"
        
        with open(holdings_file, 'r') as f:
            content = f.read()
        
        # Check for the specific tooltip format: "Previous expected: X - Actual expected now: Y"
        expected_pattern = r'Previous expected:.*Actual expected now:'
        
        matches = re.findall(expected_pattern, content)
        
        assert len(matches) > 0, "Tooltip format 'Previous expected: X - Actual expected now: Y' not found in Holdings.jsx"
        print(f"✓ Found correct tooltip format in Holdings.jsx")
        
        # Verify the exact line content
        tooltip_line_pattern = r'const diffTooltip = `Previous expected: ₹\$\{formatNum\(expectedGross\)\} - Actual expected now: ₹\$\{formatNum\(actualGross\)\}`'
        
        tooltip_matches = re.findall(tooltip_line_pattern, content)
        
        assert len(tooltip_matches) > 0, "Exact tooltip format not found"
        print(f"✓ Tooltip format is exactly: 'Previous expected: ₹X - Actual expected now: ₹Y'")


class TestEmailServiceImport:
    """Verify email service is properly imported"""
    
    def test_send_welcome_email_client_imported(self):
        """Verify send_welcome_email_client is imported in server.py"""
        server_file = "/app/backend/server.py"
        
        with open(server_file, 'r') as f:
            content = f.read()
        
        # Check for import statement
        import_pattern = r'from email_service import.*send_welcome_email_client'
        
        matches = re.findall(import_pattern, content)
        
        assert len(matches) > 0, "send_welcome_email_client not imported from email_service"
        print(f"✓ send_welcome_email_client is properly imported from email_service")


class TestBulkUploadFunctionStructure:
    """Verify the bulk upload function structure"""
    
    def test_bulk_upload_clients_function_exists(self):
        """Verify bulk_upload_clients function exists"""
        server_file = "/app/backend/server.py"
        
        with open(server_file, 'r') as f:
            content = f.read()
        
        # Check for function definition
        func_pattern = r'async def bulk_upload_clients\('
        
        matches = re.findall(func_pattern, content)
        
        # There might be multiple definitions (one at /api/bulk/clients and one at /api/clients/bulk-upload)
        assert len(matches) >= 1, "bulk_upload_clients function not found"
        print(f"✓ Found {len(matches)} bulk_upload_clients function definition(s)")
    
    def test_email_sending_in_bulk_upload_context(self):
        """Verify email sending is in the correct context within bulk upload"""
        server_file = "/app/backend/server.py"
        
        with open(server_file, 'r') as f:
            lines = f.readlines()
        
        # Find lines with send_welcome_email_client
        email_lines = []
        for i, line in enumerate(lines):
            if 'send_welcome_email_client' in line:
                email_lines.append((i+1, line.strip()))
        
        print(f"Found send_welcome_email_client at lines: {[l[0] for l in email_lines]}")
        
        # Check that at least one call is around line 4319 (bulk upload context)
        bulk_upload_email_found = False
        for line_num, line_content in email_lines:
            if 4300 <= line_num <= 4350:
                bulk_upload_email_found = True
                print(f"✓ Found email call in bulk upload context at line {line_num}")
                break
        
        assert bulk_upload_email_found, "send_welcome_email_client not found in bulk upload function (expected around line 4319)"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
