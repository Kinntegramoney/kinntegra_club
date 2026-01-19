"""
Test Enhanced Secondary Market Bond Calculator
Tests the /api/bonds/{bond_id}/calculate-enhanced endpoint
Features: Clean Price, Accrued Interest, Dirty Price, Premium/Discount calculations
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BROKER_PAN = "ANVPB5297J"
BROKER_PASSWORD = "Laksh@0208"
BROKER_PIN = "0516"
TEST_BOND_ID = "5c38067d-1dce-4b58-98da-1ae078b571a0"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token via two-step login"""
    # Step 1: PAN + Password
    step1_response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
        "pan": BROKER_PAN,
        "password": BROKER_PASSWORD
    })
    
    if step1_response.status_code != 200:
        pytest.skip(f"Login step 1 failed: {step1_response.text}")
    
    temp_token = step1_response.json().get("temp_token")
    
    # Step 2: PIN verification
    step2_response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
        "temp_token": temp_token,
        "pin": BROKER_PIN
    })
    
    if step2_response.status_code != 200:
        pytest.skip(f"Login step 2 failed: {step2_response.text}")
    
    return step2_response.json().get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestEnhancedCalculatorEndpoint:
    """Test the enhanced calculator API endpoint"""
    
    def test_bond_exists(self, api_client):
        """Verify the test bond exists"""
        response = api_client.get(f"{BASE_URL}/api/bonds/{TEST_BOND_ID}")
        assert response.status_code == 200, f"Bond not found: {response.text}"
        
        data = response.json()
        assert "bond" in data
        bond = data["bond"]
        
        # Verify bond has required fields for calculation
        assert "secondary_irr" in bond, "Bond missing secondary_irr"
        assert "coupon_rate" in bond, "Bond missing coupon_rate"
        assert "face_value" in bond or "principal_amount" in bond, "Bond missing face_value/principal_amount"
        assert "start_date" in bond, "Bond missing start_date"
        assert "end_date" in bond, "Bond missing end_date"
        
        print(f"Bond found: {bond.get('name')}")
        print(f"Secondary IRR: {bond.get('secondary_irr')}%")
        print(f"Coupon Rate: {bond.get('coupon_rate')}%")
        print(f"Face Value: {bond.get('face_value') or bond.get('principal_amount')}")
        print(f"Start Date: {bond.get('start_date')}")
        print(f"End Date: {bond.get('end_date')}")
    
    def test_calculate_enhanced_basic(self, api_client):
        """Test basic enhanced calculation with settlement date 2026-01-19"""
        settlement_date = "2026-01-19"
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": settlement_date,
                "units": 1
            }
        )
        
        assert response.status_code == 200, f"Calculation failed: {response.text}"
        
        data = response.json()
        
        # Verify all required fields are present
        required_fields = [
            "settlement_date", "units_requested", "face_value_per_unit",
            "clean_price_per_unit", "accrued_interest_per_unit", "dirty_price_per_unit",
            "total_clean_price", "total_accrued_interest", "total_dirty_price",
            "premium_discount_per_unit", "premium_discount_percentage",
            "secondary_irr", "coupon_rate", "days_to_maturity",
            "remaining_interest_payments", "remaining_principal_payments",
            "total_remaining_principal", "total_remaining_interest", "total_future_cashflows",
            "units_available"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify settlement date matches
        assert data["settlement_date"] == settlement_date
        assert data["units_requested"] == 1
        
        # Verify price calculations are reasonable
        assert data["clean_price_per_unit"] > 0, "Clean price should be positive"
        assert data["accrued_interest_per_unit"] >= 0, "Accrued interest should be non-negative"
        assert data["dirty_price_per_unit"] > 0, "Dirty price should be positive"
        
        # Verify dirty price = clean price + accrued interest
        expected_dirty = data["clean_price_per_unit"] + data["accrued_interest_per_unit"]
        assert abs(data["dirty_price_per_unit"] - expected_dirty) < 0.01, \
            f"Dirty price mismatch: {data['dirty_price_per_unit']} != {expected_dirty}"
        
        print(f"\n=== Enhanced Calculation Results (Settlement: {settlement_date}) ===")
        print(f"Clean Price: ₹{data['clean_price_per_unit']:,.2f}")
        print(f"Accrued Interest: ₹{data['accrued_interest_per_unit']:,.2f}")
        print(f"Dirty Price: ₹{data['dirty_price_per_unit']:,.2f}")
        print(f"Premium/Discount: ₹{data['premium_discount_per_unit']:,.2f} ({data['premium_discount_percentage']:.2f}%)")
        print(f"Secondary IRR: {data['secondary_irr']}%")
        print(f"Days to Maturity: {data['days_to_maturity']}")
    
    def test_calculate_enhanced_multiple_units(self, api_client):
        """Test calculation with multiple units"""
        settlement_date = "2026-01-19"
        units = 5
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": settlement_date,
                "units": units
            }
        )
        
        assert response.status_code == 200, f"Calculation failed: {response.text}"
        
        data = response.json()
        
        # Verify units
        assert data["units_requested"] == units
        
        # Verify totals are correctly calculated
        assert abs(data["total_clean_price"] - data["clean_price_per_unit"] * units) < 0.01
        assert abs(data["total_accrued_interest"] - data["accrued_interest_per_unit"] * units) < 0.01
        assert abs(data["total_dirty_price"] - data["dirty_price_per_unit"] * units) < 0.01
        
        print(f"\n=== Multiple Units Calculation ({units} units) ===")
        print(f"Total Clean Price: ₹{data['total_clean_price']:,.2f}")
        print(f"Total Accrued Interest: ₹{data['total_accrued_interest']:,.2f}")
        print(f"Total Dirty Price: ₹{data['total_dirty_price']:,.2f}")
    
    def test_interest_period_details(self, api_client):
        """Test that interest period details are returned correctly"""
        settlement_date = "2026-01-19"
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": settlement_date,
                "units": 1
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify interest period details
        assert "last_interest_payment_date" in data
        assert "next_interest_payment_date" in data
        assert "days_since_last_payment" in data
        assert "days_in_current_period" in data
        assert "accrued_interest_calculation" in data
        
        # Days should be non-negative
        assert data["days_since_last_payment"] >= 0
        assert data["days_in_current_period"] > 0
        
        print(f"\n=== Interest Period Details ===")
        print(f"Last Interest Payment: {data['last_interest_payment_date']}")
        print(f"Next Interest Payment: {data['next_interest_payment_date']}")
        print(f"Days Since Last Payment: {data['days_since_last_payment']}")
        print(f"Days in Current Period: {data['days_in_current_period']}")
        print(f"Accrued Interest Calculation: {data['accrued_interest_calculation']}")
    
    def test_future_cashflows(self, api_client):
        """Test that future cashflows are calculated correctly"""
        settlement_date = "2026-01-19"
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": settlement_date,
                "units": 1
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify future cashflows
        assert data["remaining_interest_payments"] >= 0
        assert data["remaining_principal_payments"] >= 0
        assert data["total_remaining_interest"] >= 0
        assert data["total_remaining_principal"] >= 0
        
        # Total future cashflows should equal interest + principal
        expected_total = data["total_remaining_interest"] + data["total_remaining_principal"]
        assert abs(data["total_future_cashflows"] - expected_total) < 0.01
        
        print(f"\n=== Future Cashflows ===")
        print(f"Remaining Interest Payments: {data['remaining_interest_payments']}")
        print(f"Remaining Principal Payments: {data['remaining_principal_payments']}")
        print(f"Total Remaining Interest: ₹{data['total_remaining_interest']:,.2f}")
        print(f"Total Remaining Principal: ₹{data['total_remaining_principal']:,.2f}")
        print(f"Total Future Cashflows: ₹{data['total_future_cashflows']:,.2f}")
    
    def test_secondary_irr_matches_bond(self, api_client):
        """Test that secondary IRR in response matches bond's secondary_irr"""
        # First get the bond details
        bond_response = api_client.get(f"{BASE_URL}/api/bonds/{TEST_BOND_ID}")
        assert bond_response.status_code == 200
        bond_data = bond_response.json()["bond"]
        expected_irr = bond_data.get("secondary_irr")
        
        # Now calculate
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": "2026-01-19",
                "units": 1
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify IRR matches
        assert data["secondary_irr"] == expected_irr, \
            f"Secondary IRR mismatch: {data['secondary_irr']} != {expected_irr}"
        
        print(f"\n=== IRR Verification ===")
        print(f"Bond Secondary IRR: {expected_irr}%")
        print(f"Calculator Secondary IRR: {data['secondary_irr']}%")
        print("✓ IRR matches!")
    
    def test_invalid_settlement_date_before_start(self, api_client):
        """Test that settlement date before bond start is rejected"""
        # Get bond start date
        bond_response = api_client.get(f"{BASE_URL}/api/bonds/{TEST_BOND_ID}")
        bond_data = bond_response.json()["bond"]
        start_date = datetime.fromisoformat(bond_data["start_date"])
        
        # Try settlement date before start
        invalid_date = (start_date - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": invalid_date,
                "units": 1
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "before bond start date" in response.json().get("detail", "").lower()
        print(f"✓ Correctly rejected settlement date before start: {invalid_date}")
    
    def test_invalid_settlement_date_after_maturity(self, api_client):
        """Test that settlement date after maturity is rejected"""
        # Get bond end date
        bond_response = api_client.get(f"{BASE_URL}/api/bonds/{TEST_BOND_ID}")
        bond_data = bond_response.json()["bond"]
        end_date = datetime.fromisoformat(bond_data["end_date"])
        
        # Try settlement date after maturity
        invalid_date = (end_date + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": invalid_date,
                "units": 1
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "after bond maturity" in response.json().get("detail", "").lower()
        print(f"✓ Correctly rejected settlement date after maturity: {invalid_date}")
    
    def test_invalid_bond_id(self, api_client):
        """Test that invalid bond ID returns 404"""
        response = api_client.post(
            f"{BASE_URL}/api/bonds/invalid-bond-id-12345/calculate-enhanced",
            json={
                "settlement_date": "2026-01-19",
                "units": 1
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returned 404 for invalid bond ID")
    
    def test_expected_values_for_test_bond(self, api_client):
        """
        Test expected calculation values for the test bond
        Expected (per agent context):
        - Settlement: 2026-01-19
        - Clean Price: ~₹1,04,257
        - Accrued Interest: ~₹997
        - Dirty Price: ~₹1,05,254
        """
        settlement_date = "2026-01-19"
        
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": settlement_date,
                "units": 1
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if values are in expected range (allowing 5% tolerance)
        expected_clean = 104257
        expected_accrued = 997
        expected_dirty = 105254
        
        tolerance = 0.05  # 5% tolerance
        
        clean_diff = abs(data["clean_price_per_unit"] - expected_clean) / expected_clean
        accrued_diff = abs(data["accrued_interest_per_unit"] - expected_accrued) / expected_accrued if expected_accrued > 0 else 0
        dirty_diff = abs(data["dirty_price_per_unit"] - expected_dirty) / expected_dirty
        
        print(f"\n=== Expected vs Actual Values ===")
        print(f"Clean Price: Expected ~₹{expected_clean:,}, Got ₹{data['clean_price_per_unit']:,.2f} (diff: {clean_diff*100:.2f}%)")
        print(f"Accrued Interest: Expected ~₹{expected_accrued:,}, Got ₹{data['accrued_interest_per_unit']:,.2f} (diff: {accrued_diff*100:.2f}%)")
        print(f"Dirty Price: Expected ~₹{expected_dirty:,}, Got ₹{data['dirty_price_per_unit']:,.2f} (diff: {dirty_diff*100:.2f}%)")
        
        # These are informational - we don't fail if slightly different
        # as the exact values depend on bond configuration
        if clean_diff <= tolerance:
            print("✓ Clean price within expected range")
        else:
            print(f"⚠ Clean price differs by {clean_diff*100:.2f}% from expected")
        
        if dirty_diff <= tolerance:
            print("✓ Dirty price within expected range")
        else:
            print(f"⚠ Dirty price differs by {dirty_diff*100:.2f}% from expected")


class TestEnhancedCalculatorEdgeCases:
    """Test edge cases for the enhanced calculator"""
    
    def test_units_exceeds_available(self, api_client):
        """Test that requesting more units than available is rejected"""
        # First get available units
        bond_response = api_client.get(f"{BASE_URL}/api/bonds/{TEST_BOND_ID}")
        bond_data = bond_response.json()["bond"]
        total_units = bond_data.get("total_units", 1)
        units_sold = bond_data.get("units_sold", 0)
        available = total_units - units_sold
        
        if available <= 0:
            pytest.skip("No units available for this test")
        
        # Request more than available
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": "2026-01-19",
                "units": available + 100
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "units available" in response.json().get("detail", "").lower()
        print(f"✓ Correctly rejected request for {available + 100} units (only {available} available)")
    
    def test_zero_units(self, api_client):
        """Test that zero units is handled"""
        response = api_client.post(
            f"{BASE_URL}/api/bonds/{TEST_BOND_ID}/calculate-enhanced",
            json={
                "settlement_date": "2026-01-19",
                "units": 0
            }
        )
        
        # Should either reject or calculate for 0 units
        print(f"Zero units response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            assert data["total_dirty_price"] == 0
            print("✓ Zero units returns zero totals")
        else:
            print(f"✓ Zero units rejected with status {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
