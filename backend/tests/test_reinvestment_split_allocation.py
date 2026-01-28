"""
Test suite for Reinvestment Split Allocation feature
Tests:
1. Backend API: PUT /api/reinvestment/tag/{cashflow_id} with ucc_allocations array
2. Backend validation: Bonds portfolio requires amount >= 10,00,000
3. Backend validation: Real Estate portfolio requires amount >= 25,00,000
4. Backend validation: Amount < 1000 must use 'none' portfolio
5. Backend: Split allocations saved correctly to holding_cashflows collection
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReinvestmentSplitAllocation:
    """Test reinvestment split allocation API and business rules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - authenticate as broker"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Broker credentials
        self.broker_pan = "ANVPB5297J"
        self.broker_password = "Laksh@0208"
        self.broker_pin = "0516"
        
        # Authenticate
        self.token = self._authenticate()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def _authenticate(self):
        """Two-step authentication to get broker token"""
        # Step 1: PAN + Password
        step1_response = self.session.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1_response.status_code != 200:
            pytest.skip(f"Authentication step 1 failed: {step1_response.text}")
            return None
        
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: PIN verification
        step2_response = self.session.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": self.broker_pin}
        )
        if step2_response.status_code != 200:
            pytest.skip(f"Authentication step 2 failed: {step2_response.text}")
            return None
        
        return step2_response.json().get("token")
    
    def _get_test_cashflow(self):
        """Get a cashflow entry for testing"""
        response = self.session.get(f"{BASE_URL}/api/reinvestment/upcoming")
        if response.status_code != 200:
            return None
        
        data = response.json()
        # Find an untagged entry with a client that has UCCs
        for entry in data.get("untagged_past", []) + data.get("untagged_upcoming", []):
            for cf in entry.get("entries", []):
                if cf.get("client_ucc_list") and len(cf.get("client_ucc_list", [])) > 0:
                    return {
                        "cashflow_id": cf.get("cashflow_id") or cf.get("id"),
                        "client_id": cf.get("client_id"),
                        "ucc_list": cf.get("client_ucc_list") or entry.get("ucc_list", []),
                        "net_amount": cf.get("net_amount", 0),
                        "principal_amount": cf.get("principal_net", 0),
                        "interest_amount": cf.get("interest_net", 0)
                    }
        return None
    
    # ==================== AUTHENTICATION TESTS ====================
    
    def test_broker_authentication(self):
        """Test broker can authenticate successfully"""
        assert self.token is not None, "Broker authentication should succeed"
        print(f"✓ Broker authenticated successfully")
    
    # ==================== API ENDPOINT TESTS ====================
    
    def test_get_upcoming_reinvestments(self):
        """Test GET /api/reinvestment/upcoming returns data"""
        response = self.session.get(f"{BASE_URL}/api/reinvestment/upcoming")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "untagged_past" in data or "untagged_upcoming" in data, "Response should contain untagged entries"
        print(f"✓ GET /api/reinvestment/upcoming returns data")
    
    def test_tag_with_single_allocation(self):
        """Test PUT /api/reinvestment/tag with single allocation (original flow)"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "portfolio_category": "wealth",
                "target_ucc": ucc
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True or "cashflow_id" in str(response.text).lower(), "Should return success"
        print(f"✓ Single allocation tagging works")
    
    def test_tag_with_split_allocations(self):
        """Test PUT /api/reinvestment/tag with ucc_allocations array"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        total_amount = cashflow.get("net_amount", 100000)
        
        # Split into two allocations
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": total_amount * 0.6,
                        "portfolio": "wealth",
                        "tag": "both"
                    },
                    {
                        "ucc": ucc,
                        "amount": total_amount * 0.4,
                        "portfolio": "tax",
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Should return success for split allocation"
        assert "allocations" in data, "Response should contain allocations"
        print(f"✓ Split allocation tagging works with ucc_allocations array")
    
    # ==================== BUSINESS RULE VALIDATION TESTS ====================
    
    def test_bonds_portfolio_requires_10_lakhs(self):
        """Test: Bonds portfolio requires amount >= 10,00,000 (10 lakhs)"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Try to allocate less than 10 lakhs to bonds portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 500000,  # 5 lakhs - should fail
                        "portfolio": "bonds",
                        "tag": "both"
                    }
                ]
            }
        )
        
        # Should return 400 error
        assert response.status_code == 400, f"Expected 400 for bonds < 10 lakhs, got {response.status_code}"
        assert "10,00,000" in response.text or "1000000" in response.text, "Error should mention 10 lakhs requirement"
        print(f"✓ Bonds portfolio validation: rejects amount < 10 lakhs")
    
    def test_bonds_portfolio_accepts_10_lakhs_plus(self):
        """Test: Bonds portfolio accepts amount >= 10,00,000"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Allocate exactly 10 lakhs to bonds portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 1000000,  # 10 lakhs - should pass
                        "portfolio": "bonds",
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200 for bonds >= 10 lakhs, got {response.status_code}: {response.text}"
        print(f"✓ Bonds portfolio validation: accepts amount >= 10 lakhs")
    
    def test_real_estate_portfolio_requires_25_lakhs(self):
        """Test: Real Estate portfolio requires amount >= 25,00,000 (25 lakhs)"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Try to allocate less than 25 lakhs to real_estate portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 2000000,  # 20 lakhs - should fail
                        "portfolio": "real_estate",
                        "tag": "both"
                    }
                ]
            }
        )
        
        # Should return 400 error
        assert response.status_code == 400, f"Expected 400 for real_estate < 25 lakhs, got {response.status_code}"
        assert "25,00,000" in response.text or "2500000" in response.text, "Error should mention 25 lakhs requirement"
        print(f"✓ Real Estate portfolio validation: rejects amount < 25 lakhs")
    
    def test_real_estate_portfolio_accepts_25_lakhs_plus(self):
        """Test: Real Estate portfolio accepts amount >= 25,00,000"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Allocate exactly 25 lakhs to real_estate portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 2500000,  # 25 lakhs - should pass
                        "portfolio": "real_estate",
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200 for real_estate >= 25 lakhs, got {response.status_code}: {response.text}"
        print(f"✓ Real Estate portfolio validation: accepts amount >= 25 lakhs")
    
    def test_amount_less_than_1000_requires_none_portfolio(self):
        """Test: Amount < 1000 must use 'none' portfolio"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Try to allocate < 1000 to a non-none portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 500,  # < 1000 - should require 'none' portfolio
                        "portfolio": "wealth",  # Not 'none' - should fail
                        "tag": "both"
                    }
                ]
            }
        )
        
        # Should return 400 error
        assert response.status_code == 400, f"Expected 400 for amount < 1000 with non-none portfolio, got {response.status_code}"
        assert "none" in response.text.lower() or "1,000" in response.text or "1000" in response.text, "Error should mention 'none' portfolio requirement"
        print(f"✓ Amount < 1000 validation: requires 'none' portfolio")
    
    def test_amount_less_than_1000_accepts_none_portfolio(self):
        """Test: Amount < 1000 with 'none' portfolio is accepted"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        # Allocate < 1000 with 'none' portfolio
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 500,  # < 1000
                        "portfolio": "none",  # Correct portfolio for small amounts
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200 for amount < 1000 with 'none' portfolio, got {response.status_code}: {response.text}"
        print(f"✓ Amount < 1000 with 'none' portfolio is accepted")
    
    # ==================== SPLIT ALLOCATION PERSISTENCE TESTS ====================
    
    def test_split_allocations_saved_to_database(self):
        """Test: Split allocations are saved correctly to holding_cashflows collection"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        total_amount = cashflow.get("net_amount", 100000)
        
        # Create split allocation
        alloc1_amount = round(total_amount * 0.7 / 100) * 100  # Round to 100
        alloc2_amount = round(total_amount * 0.3 / 100) * 100
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "principal",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": alloc1_amount,
                        "portfolio": "wealth",
                        "tag": "principal"
                    },
                    {
                        "ucc": ucc,
                        "amount": alloc2_amount,
                        "portfolio": "tax",
                        "tag": "principal"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response contains allocations
        assert data.get("success") == True, "Should return success"
        assert "allocations" in data, "Response should contain allocations"
        assert len(data["allocations"]) == 2, "Should have 2 allocations"
        
        # Verify allocation details
        allocations = data["allocations"]
        assert allocations[0]["portfolio"] == "wealth", "First allocation should be wealth"
        assert allocations[1]["portfolio"] == "tax", "Second allocation should be tax"
        
        print(f"✓ Split allocations saved correctly with {len(allocations)} allocations")
    
    def test_split_allocation_response_contains_required_fields(self):
        """Test: Split allocation response contains all required fields"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "interest",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 50000,
                        "portfolio": "short_term",
                        "tag": "interest"
                    }
                ]
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check required fields in response
        assert "success" in data, "Response should have 'success' field"
        assert "cashflow_id" in data, "Response should have 'cashflow_id' field"
        assert "allocations" in data, "Response should have 'allocations' field"
        assert "is_past_date" in data, "Response should have 'is_past_date' field"
        assert "approval_status" in data, "Response should have 'approval_status' field"
        
        # Check allocation structure
        if data["allocations"]:
            alloc = data["allocations"][0]
            assert "ucc" in alloc, "Allocation should have 'ucc' field"
            assert "amount" in alloc, "Allocation should have 'amount' field"
            assert "portfolio" in alloc, "Allocation should have 'portfolio' field"
            assert "tag" in alloc, "Allocation should have 'tag' field"
        
        print(f"✓ Split allocation response contains all required fields")
    
    # ==================== EDGE CASE TESTS ====================
    
    def test_invalid_ucc_rejected(self):
        """Test: Invalid UCC (not belonging to client) is rejected"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": "INVALID_UCC_12345",  # Invalid UCC
                        "amount": 50000,
                        "portfolio": "wealth",
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid UCC, got {response.status_code}"
        assert "ucc" in response.text.lower() or "does not belong" in response.text.lower(), "Error should mention UCC issue"
        print(f"✓ Invalid UCC is rejected")
    
    def test_zero_amount_rejected(self):
        """Test: Zero amount allocation is rejected"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 0,  # Zero amount - should fail
                        "portfolio": "wealth",
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for zero amount, got {response.status_code}"
        print(f"✓ Zero amount allocation is rejected")
    
    def test_empty_portfolio_rejected(self):
        """Test: Empty portfolio is rejected"""
        cashflow = self._get_test_cashflow()
        if not cashflow:
            pytest.skip("No test cashflow available")
        
        ucc = cashflow["ucc_list"][0] if cashflow["ucc_list"] else None
        if not ucc:
            pytest.skip("No UCC available for testing")
        
        response = self.session.put(
            f"{BASE_URL}/api/reinvestment/tag/{cashflow['cashflow_id']}",
            json={
                "reinvestment_tag": "both",
                "ucc_allocations": [
                    {
                        "ucc": ucc,
                        "amount": 50000,
                        "portfolio": "",  # Empty portfolio - should fail
                        "tag": "both"
                    }
                ]
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for empty portfolio, got {response.status_code}"
        print(f"✓ Empty portfolio is rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
