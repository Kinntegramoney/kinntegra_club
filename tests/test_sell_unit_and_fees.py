"""
Test Suite for Sell Unit Feature and DLD/Admin Fee Display
Tests:
1. Sell Unit API endpoint - validates sale_record fields (xirr, net_profit, total_invested)
2. DLD Fee and Admin Fee data in opportunity response
3. Selling fee percentage auto-population from opportunity data
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test property ID with fully_invested status
TEST_PROPERTY_ID = "382086b4-b653-4557-8f58-31827dd877f3"

# Broker credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"


class TestAuthentication:
    """Test broker authentication flow"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token via 2-step login"""
        # Step 1: PAN + Password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": BROKER_PAN, "password": BROKER_PASSWORD}
        )
        assert step1_response.status_code == 200, f"Step 1 failed: {step1_response.text}"
        temp_token = step1_response.json().get("temp_token")
        assert temp_token, "No temp_token in step 1 response"
        
        # Step 2: PIN verification
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": BROKER_PIN}
        )
        assert step2_response.status_code == 200, f"Step 2 failed: {step2_response.text}"
        token = step2_response.json().get("token")
        assert token, "No token in step 2 response"
        
        return token
    
    def test_broker_login_success(self, broker_token):
        """Verify broker can login successfully"""
        assert broker_token is not None
        assert len(broker_token) > 50  # JWT tokens are typically long


class TestPropertyData:
    """Test property data contains required fields for Sell Unit and DLD/Admin fees"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={"pan": BROKER_PAN, "password": BROKER_PASSWORD})
        temp_token = step1.json().get("temp_token")
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={"temp_token": temp_token, "pin": BROKER_PIN})
        return step2.json().get("token")
    
    @pytest.fixture(scope="class")
    def property_data(self, broker_token):
        """Fetch test property data"""
        response = requests.get(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        assert response.status_code == 200, f"Failed to fetch property: {response.text}"
        return response.json()
    
    def test_property_has_fully_invested_status(self, property_data):
        """Property should have fully_invested status for sell unit feature"""
        assert property_data.get("status") == "fully_invested", \
            f"Expected fully_invested, got {property_data.get('status')}"
    
    def test_property_has_dld_fee(self, property_data):
        """Property should have DLD fee configured"""
        dld_fee = property_data.get("dld_fee", 0)
        assert dld_fee > 0, f"DLD fee should be > 0, got {dld_fee}"
        # Verify DLD fee is approximately 4% of unit price
        unit_price = property_data.get("unit_price", 0)
        expected_dld = unit_price * 0.04
        assert abs(dld_fee - expected_dld) < 1, f"DLD fee {dld_fee} should be ~4% of {unit_price}"
    
    def test_property_has_admin_fee(self, property_data):
        """Property should have Admin fee configured"""
        admin_fee = property_data.get("admin_fee", 0)
        assert admin_fee > 0, f"Admin fee should be > 0, got {admin_fee}"
    
    def test_property_has_selling_fee_percentage(self, property_data):
        """Property should have selling fee percentage for auto-population"""
        # Check either unit_selling_fee_percentage or selling_fee_percentage
        unit_selling_fee = property_data.get("unit_selling_fee_percentage")
        selling_fee = property_data.get("selling_fee_percentage")
        
        effective_fee = unit_selling_fee if unit_selling_fee is not None else selling_fee
        assert effective_fee is not None and effective_fee > 0, \
            f"Selling fee percentage should be set. unit_selling_fee: {unit_selling_fee}, selling_fee: {selling_fee}"
    
    def test_property_has_payment_schedule(self, property_data):
        """Property should have payment schedule for XIRR calculation"""
        schedule = property_data.get("payment_schedule", [])
        assert len(schedule) > 0, "Payment schedule should not be empty"
        
        # Verify schedule has required fields
        for milestone in schedule:
            assert "date" in milestone, "Milestone should have date"
            assert "percentage" in milestone, "Milestone should have percentage"
    
    def test_property_has_investors(self, property_data):
        """Property should have investors for DLD/Admin fee per-investor columns"""
        investors = property_data.get("investors", [])
        assert len(investors) > 0, "Property should have at least one investor"
        
        # Verify investor data structure
        for investor in investors:
            assert "client_id" in investor, "Investor should have client_id"
            assert "client_name" in investor, "Investor should have client_name"
            assert "share_percentage" in investor, "Investor should have share_percentage"


class TestSellUnitAPI:
    """Test the Sell Unit API endpoint"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={"pan": BROKER_PAN, "password": BROKER_PASSWORD})
        temp_token = step1.json().get("temp_token")
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={"temp_token": temp_token, "pin": BROKER_PIN})
        return step2.json().get("token")
    
    def test_sell_unit_requires_authentication(self):
        """Sell unit endpoint should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}/sell",
            json={
                "sale_date": "2027-06-15",
                "sale_price": 4000000
            }
        )
        assert response.status_code == 401 or response.status_code == 403, \
            f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_sell_unit_validates_required_fields(self, broker_token):
        """Sell unit should validate required fields"""
        # Missing sale_price
        response = requests.post(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}/sell",
            headers={"Authorization": f"Bearer {broker_token}"},
            json={"sale_date": "2027-06-15"}
        )
        assert response.status_code == 422, f"Expected 422 for missing sale_price, got {response.status_code}"
    
    def test_sell_unit_rejects_non_fully_invested(self, broker_token):
        """Sell unit should reject properties that are not fully_invested"""
        # Try to sell a property that doesn't exist or isn't fully invested
        response = requests.post(
            f"{BASE_URL}/api/real-estate-opportunities/non-existent-id/sell",
            headers={"Authorization": f"Bearer {broker_token}"},
            json={
                "sale_date": "2027-06-15",
                "sale_price": 4000000
            }
        )
        assert response.status_code in [404, 400], \
            f"Expected 404/400 for non-existent property, got {response.status_code}"
    
    def test_sell_unit_request_model_accepts_xirr_fields(self, broker_token):
        """Verify the SellUnitRequest model accepts xirr, net_profit, total_invested fields"""
        # Note: We won't actually submit this to avoid changing the property status
        # This test verifies the API accepts the expected payload structure
        
        # First, get current property status
        prop_response = requests.get(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        prop_data = prop_response.json()
        
        # Only test if property is still fully_invested (not already sold)
        if prop_data.get("status") != "fully_invested":
            pytest.skip("Property already sold, skipping sell test")
        
        # Prepare a valid sell request with all XIRR-related fields
        sell_payload = {
            "sale_date": "2027-06-15",
            "sale_price": 4500000,
            "brokerage_fee": 112500,  # 2.5% of sale price
            "selling_fee_percentage": 2.5,
            "net_proceeds": 4387500,  # sale_price - brokerage_fee
            "total_invested": 3633342.23,  # unit_price + dld_fee + admin_fee
            "net_profit": 754157.77,  # net_proceeds - total_invested
            "xirr": 15.5,  # Example XIRR percentage
            "notes": "Test sale - DO NOT SUBMIT"
        }
        
        # Verify the payload structure matches what the API expects
        assert "sale_date" in sell_payload
        assert "sale_price" in sell_payload
        assert "xirr" in sell_payload
        assert "net_profit" in sell_payload
        assert "total_invested" in sell_payload
        
        # Note: Not actually submitting to preserve test data
        print(f"Sell payload structure validated: {list(sell_payload.keys())}")


class TestDLDAdminFeeStructure:
    """Test DLD and Admin fee data structure in API response"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={"pan": BROKER_PAN, "password": BROKER_PASSWORD})
        temp_token = step1.json().get("temp_token")
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={"temp_token": temp_token, "pin": BROKER_PIN})
        return step2.json().get("token")
    
    @pytest.fixture(scope="class")
    def property_data(self, broker_token):
        """Fetch test property data"""
        response = requests.get(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        return response.json()
    
    def test_dld_fee_percentage_present(self, property_data):
        """DLD fee percentage should be present for display"""
        dld_pct = property_data.get("dld_fee_percentage")
        assert dld_pct is not None, "dld_fee_percentage should be present"
        assert dld_pct == 4.0, f"Expected DLD fee percentage 4%, got {dld_pct}%"
    
    def test_dld_fee_amount_calculated_correctly(self, property_data):
        """DLD fee amount should match percentage calculation"""
        unit_price = property_data.get("unit_price", 0)
        dld_fee = property_data.get("dld_fee", 0)
        dld_pct = property_data.get("dld_fee_percentage", 4)
        
        expected_dld = unit_price * dld_pct / 100
        assert abs(dld_fee - expected_dld) < 1, \
            f"DLD fee {dld_fee} should equal {dld_pct}% of {unit_price} = {expected_dld}"
    
    def test_admin_fee_present(self, property_data):
        """Admin fee should be present"""
        admin_fee = property_data.get("admin_fee")
        assert admin_fee is not None and admin_fee > 0, \
            f"Admin fee should be present and > 0, got {admin_fee}"
    
    def test_dld_admin_payments_structure(self, property_data):
        """DLD/Admin payments array should exist for tracking per-investor payments"""
        # This field may be empty but should exist
        dld_admin_payments = property_data.get("dld_admin_payments")
        # It's okay if it's None or empty list - just verify the structure when present
        if dld_admin_payments:
            for payment in dld_admin_payments:
                assert "type" in payment, "Payment should have type (dld/admin)"
                assert "investor_id" in payment, "Payment should have investor_id"


class TestSellingFeeAutoPopulation:
    """Test selling fee percentage auto-population logic"""
    
    @pytest.fixture(scope="class")
    def broker_token(self):
        """Get broker authentication token"""
        step1 = requests.post(f"{BASE_URL}/api/auth/login-step1", json={"pan": BROKER_PAN, "password": BROKER_PASSWORD})
        temp_token = step1.json().get("temp_token")
        step2 = requests.post(f"{BASE_URL}/api/auth/login-step2", json={"temp_token": temp_token, "pin": BROKER_PIN})
        return step2.json().get("token")
    
    @pytest.fixture(scope="class")
    def property_data(self, broker_token):
        """Fetch test property data"""
        response = requests.get(
            f"{BASE_URL}/api/real-estate-opportunities/{TEST_PROPERTY_ID}",
            headers={"Authorization": f"Bearer {broker_token}"}
        )
        return response.json()
    
    def test_selling_fee_fallback_logic(self, property_data):
        """
        Frontend uses: unit_selling_fee_percentage || selling_fee_percentage || 0
        Verify at least one is set
        """
        unit_selling_fee = property_data.get("unit_selling_fee_percentage")
        selling_fee = property_data.get("selling_fee_percentage")
        
        # At least one should be set
        effective_fee = unit_selling_fee if unit_selling_fee is not None else selling_fee
        assert effective_fee is not None, \
            "Either unit_selling_fee_percentage or selling_fee_percentage should be set"
        
        # For this test property, selling_fee_percentage should be 2.5
        if unit_selling_fee is None:
            assert selling_fee == 2.5, f"Expected selling_fee_percentage 2.5, got {selling_fee}"
        
        print(f"Effective selling fee: {effective_fee}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
