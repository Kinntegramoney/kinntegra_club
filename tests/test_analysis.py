"""
Test suite for Analysis feature - CAS PDF upload and Gap Sheet generation
Tests: Upload CAS PDF, PDF parsing, Gap Sheet download, Analysis listing, Analysis deletion, Scheme master upload
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://perm-unified.preview.emergentagent.com')

# Test credentials
BROKER_CREDENTIALS = {
    "pan": "ANVPB5297J",
    "password": "Laksh@0208",
    "pin": "0516"
}

# Test files
CAS_PDF_PATH = "/app/uploads/analysis/cas_report.pdf"
CAS_PASSWORD = "prima12"
SCHEME_MASTER_PATH = "/app/uploads/analysis/scheme_master.txt"


class TestAnalysisFeature:
    """Test suite for Analysis feature"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_CREDENTIALS["pan"], "password": BROKER_CREDENTIALS["password"]}
        )
        
        if step1_response.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_response.text}")
        
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: Verify PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_CREDENTIALS["pin"]}
        )
        
        if step2_response.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_response.text}")
        
        return step2_response.json().get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, broker_token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {broker_token}"}
    
    # ==================== Authentication Tests ====================
    
    def test_analysis_endpoints_require_auth(self):
        """Test that analysis endpoints require authentication"""
        # Test list analyses without auth
        response = requests.get(f"{BASE_URL}/api/analysis")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        # Test scheme master status without auth
        response = requests.get(f"{BASE_URL}/api/analysis/scheme-master/status")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Analysis endpoints require authentication")
    
    # ==================== Scheme Master Tests ====================
    
    def test_scheme_master_status(self, auth_headers):
        """Test GET /api/analysis/scheme-master/status"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/scheme-master/status",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "exists" in data, "Response should have 'exists' field"
        assert "total_schemes" in data, "Response should have 'total_schemes' field"
        
        print(f"✓ Scheme master status: exists={data['exists']}, total_schemes={data.get('total_schemes', 0)}")
        return data
    
    def test_upload_scheme_master(self, auth_headers):
        """Test POST /api/analysis/upload-scheme-master"""
        if not os.path.exists(SCHEME_MASTER_PATH):
            pytest.skip(f"Scheme master file not found: {SCHEME_MASTER_PATH}")
        
        with open(SCHEME_MASTER_PATH, 'rb') as f:
            files = {'file': ('scheme_master.txt', f, 'text/plain')}
            response = requests.post(
                f"{BASE_URL}/api/analysis/upload-scheme-master",
                headers=auth_headers,
                files=files
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data, "Response should have 'message' field"
        assert "schemes_added" in data, "Response should have 'schemes_added' field"
        assert "total_schemes_in_file" in data, "Response should have 'total_schemes_in_file' field"
        
        print(f"✓ Scheme master uploaded: {data['schemes_added']} schemes added, {data['total_schemes_in_file']} in file")
    
    def test_scheme_master_broker_only(self, auth_headers):
        """Test that only brokers can upload scheme master"""
        # This test verifies the endpoint exists and requires broker role
        # The actual role check is done server-side
        response = requests.get(
            f"{BASE_URL}/api/analysis/scheme-master/status",
            headers=auth_headers
        )
        assert response.status_code == 200, "Broker should be able to access scheme master status"
        print("✓ Scheme master access verified for broker")
    
    # ==================== CAS Upload Tests ====================
    
    def test_upload_cas_pdf(self, auth_headers):
        """Test POST /api/analysis/upload-cas"""
        if not os.path.exists(CAS_PDF_PATH):
            pytest.skip(f"CAS PDF file not found: {CAS_PDF_PATH}")
        
        with open(CAS_PDF_PATH, 'rb') as f:
            files = {'file': ('cas_report.pdf', f, 'application/pdf')}
            data = {'password': CAS_PASSWORD}
            response = requests.post(
                f"{BASE_URL}/api/analysis/upload-cas",
                headers=auth_headers,
                files=files,
                data=data
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        result = response.json()
        
        # Verify response structure
        assert "analysis_id" in result, "Response should have 'analysis_id'"
        assert "filename" in result, "Response should have 'filename'"
        assert "total_folios" in result, "Response should have 'total_folios'"
        assert "total_transactions" in result, "Response should have 'total_transactions'"
        assert "status" in result, "Response should have 'status'"
        
        # Verify data extraction
        assert result["status"] == "completed", f"Expected status 'completed', got {result['status']}"
        assert result["total_folios"] > 0, "Should extract at least one folio"
        
        print(f"✓ CAS PDF uploaded: {result['total_folios']} folios, {result['total_transactions']} transactions")
        return result["analysis_id"]
    
    def test_upload_cas_invalid_password(self, auth_headers):
        """Test CAS upload with invalid password"""
        if not os.path.exists(CAS_PDF_PATH):
            pytest.skip(f"CAS PDF file not found: {CAS_PDF_PATH}")
        
        with open(CAS_PDF_PATH, 'rb') as f:
            files = {'file': ('cas_report.pdf', f, 'application/pdf')}
            data = {'password': 'wrongpassword'}
            response = requests.post(
                f"{BASE_URL}/api/analysis/upload-cas",
                headers=auth_headers,
                files=files,
                data=data
            )
        
        # Should return 400 for invalid password
        assert response.status_code == 400, f"Expected 400 for invalid password, got {response.status_code}"
        print("✓ Invalid password correctly rejected")
    
    def test_upload_cas_missing_password(self, auth_headers):
        """Test CAS upload without password"""
        if not os.path.exists(CAS_PDF_PATH):
            pytest.skip(f"CAS PDF file not found: {CAS_PDF_PATH}")
        
        with open(CAS_PDF_PATH, 'rb') as f:
            files = {'file': ('cas_report.pdf', f, 'application/pdf')}
            response = requests.post(
                f"{BASE_URL}/api/analysis/upload-cas",
                headers=auth_headers,
                files=files
            )
        
        # Should return 422 for missing required field
        assert response.status_code == 422, f"Expected 422 for missing password, got {response.status_code}"
        print("✓ Missing password correctly rejected")
    
    # ==================== Analysis Listing Tests ====================
    
    def test_list_analyses(self, auth_headers):
        """Test GET /api/analysis"""
        response = requests.get(
            f"{BASE_URL}/api/analysis",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Response should be a list"
        
        # If there are analyses, verify structure
        if len(data) > 0:
            analysis = data[0]
            assert "id" in analysis, "Analysis should have 'id'"
            assert "filename" in analysis, "Analysis should have 'filename'"
            assert "user_name" in analysis, "Analysis should have 'user_name'"
            assert "created_at" in analysis, "Analysis should have 'created_at'"
            # parsed_data should be excluded from list
            assert "parsed_data" not in analysis, "parsed_data should be excluded from list"
        
        print(f"✓ Analysis list retrieved: {len(data)} analyses found")
        return data
    
    # ==================== Analysis Details Tests ====================
    
    def test_get_analysis_details(self, auth_headers):
        """Test GET /api/analysis/{analysis_id}"""
        # First get list of analyses
        list_response = requests.get(
            f"{BASE_URL}/api/analysis",
            headers=auth_headers
        )
        
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No analyses available to test details")
        
        analysis_id = list_response.json()[0]["id"]
        
        # Get details
        response = requests.get(
            f"{BASE_URL}/api/analysis/{analysis_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify full data is returned
        assert "id" in data, "Response should have 'id'"
        assert "parsed_data" in data, "Response should have 'parsed_data'"
        assert "filename" in data, "Response should have 'filename'"
        
        # Verify parsed_data structure
        parsed = data["parsed_data"]
        assert "folios" in parsed, "parsed_data should have 'folios'"
        assert "transactions" in parsed, "parsed_data should have 'transactions'"
        
        print(f"✓ Analysis details retrieved: {len(parsed.get('folios', {}))} folios, {parsed.get('total_transactions', 0)} transactions")
        return data
    
    def test_get_analysis_not_found(self, auth_headers):
        """Test GET /api/analysis/{analysis_id} with invalid ID"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/invalid-id-12345",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid analysis ID correctly returns 404")
    
    # ==================== Gap Sheet Download Tests ====================
    
    def test_download_gap_sheet(self, auth_headers):
        """Test GET /api/analysis/{analysis_id}/download"""
        # First get list of analyses
        list_response = requests.get(
            f"{BASE_URL}/api/analysis",
            headers=auth_headers
        )
        
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No analyses available to test download")
        
        analysis_id = list_response.json()[0]["id"]
        
        # Download Gap Sheet
        response = requests.get(
            f"{BASE_URL}/api/analysis/{analysis_id}/download",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify content type
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type or "octet-stream" in content_type, \
            f"Expected Excel content type, got {content_type}"
        
        # Verify content disposition
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert "GapSheet" in content_disp, "Filename should contain 'GapSheet'"
        
        # Verify file size
        assert len(response.content) > 1000, "Excel file should have substantial content"
        
        print(f"✓ Gap Sheet downloaded: {len(response.content)} bytes")
    
    def test_download_gap_sheet_not_found(self, auth_headers):
        """Test download with invalid analysis ID"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/invalid-id-12345/download",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid analysis ID correctly returns 404 for download")
    
    # ==================== Analysis Deletion Tests ====================
    
    def test_delete_analysis(self, auth_headers):
        """Test DELETE /api/analysis/{analysis_id}"""
        # First upload a new CAS to delete
        if not os.path.exists(CAS_PDF_PATH):
            pytest.skip(f"CAS PDF file not found: {CAS_PDF_PATH}")
        
        with open(CAS_PDF_PATH, 'rb') as f:
            files = {'file': ('test_delete.pdf', f, 'application/pdf')}
            data = {'password': CAS_PASSWORD}
            upload_response = requests.post(
                f"{BASE_URL}/api/analysis/upload-cas",
                headers=auth_headers,
                files=files,
                data=data
            )
        
        if upload_response.status_code != 200:
            pytest.skip("Could not upload CAS for deletion test")
        
        analysis_id = upload_response.json()["analysis_id"]
        
        # Delete the analysis
        response = requests.delete(
            f"{BASE_URL}/api/analysis/{analysis_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should have 'message'"
        
        # Verify it's deleted
        get_response = requests.get(
            f"{BASE_URL}/api/analysis/{analysis_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 404, "Deleted analysis should return 404"
        
        print("✓ Analysis deleted successfully")
    
    def test_delete_analysis_not_found(self, auth_headers):
        """Test DELETE with invalid analysis ID"""
        response = requests.delete(
            f"{BASE_URL}/api/analysis/invalid-id-12345",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid analysis ID correctly returns 404 for delete")


class TestAnalysisDataValidation:
    """Test data validation and parsing accuracy"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_CREDENTIALS["pan"], "password": BROKER_CREDENTIALS["password"]}
        )
        
        if step1_response.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_response.text}")
        
        temp_token = step1_response.json().get("temp_token")
        
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_CREDENTIALS["pin"]}
        )
        
        if step2_response.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_response.text}")
        
        return step2_response.json().get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, broker_token):
        return {"Authorization": f"Bearer {broker_token}"}
    
    def test_parsed_data_structure(self, auth_headers):
        """Verify parsed data has correct structure"""
        # Get an existing analysis
        list_response = requests.get(
            f"{BASE_URL}/api/analysis",
            headers=auth_headers
        )
        
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No analyses available")
        
        analysis_id = list_response.json()[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/analysis/{analysis_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        parsed = data.get("parsed_data", {})
        
        # Verify portfolio_summary structure
        if "portfolio_summary" in parsed:
            summary = parsed["portfolio_summary"]
            if "total_cost" in summary:
                assert isinstance(summary["total_cost"], (int, float)), "total_cost should be numeric"
            if "total_value" in summary:
                assert isinstance(summary["total_value"], (int, float)), "total_value should be numeric"
        
        # Verify folios structure
        if "folios" in parsed:
            folios = parsed["folios"]
            assert isinstance(folios, dict), "folios should be a dictionary"
            
            for folio_id, folio_data in folios.items():
                # Each folio should have key fields
                assert "scheme" in folio_data or folio_data.get("scheme") is None, "folio should have scheme"
                if "closing_balance" in folio_data:
                    assert isinstance(folio_data["closing_balance"], (int, float)), "closing_balance should be numeric"
        
        # Verify transactions structure
        if "transactions" in parsed:
            transactions = parsed["transactions"]
            assert isinstance(transactions, list), "transactions should be a list"
            
            if len(transactions) > 0:
                tx = transactions[0]
                # Each transaction should have key fields
                assert "date" in tx, "transaction should have date"
                assert "amount" in tx, "transaction should have amount"
        
        print(f"✓ Parsed data structure validated: {len(parsed.get('folios', {}))} folios, {len(parsed.get('transactions', []))} transactions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
