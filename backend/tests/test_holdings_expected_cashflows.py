"""
Test Holdings Expected Cashflows API
Tests the fix for Expected Repayments calculation in Holdings modal.
The modal should show expected_cashflows (from bond template) and actual_cashflows (real-world prepayments).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHoldingsExpectedCashflows:
    """Test expected_cashflows and actual_cashflows in holdings API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        # Login step 1
        response = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": "ANVPB5297J",
            "password": "Laksh@0208"
        })
        assert response.status_code == 200, f"Login step 1 failed: {response.text}"
        temp_token = response.json().get('temp_token')
        
        # Login step 2
        response = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": "0516"
        })
        assert response.status_code == 200, f"Login step 2 failed: {response.text}"
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_holdings_clients_list(self):
        """Test that holdings clients list returns Fali Investor"""
        response = requests.get(f"{BASE_URL}/api/holdings/clients", headers=self.headers)
        assert response.status_code == 200
        
        clients = response.json()
        assert len(clients) > 0, "No clients found"
        
        # Find Fali Investor
        fali = next((c for c in clients if c['pan_number'] == 'AAAPU0926D'), None)
        assert fali is not None, "Fali Investor (AAAPU0926D) not found"
        assert fali['name'] == 'Fali Investor'
        assert fali['trade_count'] == 3, f"Expected 3 trades, got {fali['trade_count']}"
    
    def test_holdings_has_expected_cashflows(self):
        """Test that holdings API returns expected_cashflows for each trade"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        assert len(holdings) == 3, f"Expected 3 holdings, got {len(holdings)}"
        
        for holding in holdings:
            # Check expected_cashflows exists and has data
            expected_cfs = holding.get('expected_cashflows', [])
            assert len(expected_cfs) > 0, f"No expected_cashflows for trade {holding['trade_id']}"
            
            # Verify expected cashflow structure
            cf = expected_cfs[0]
            assert 'date' in cf, "Missing date in expected_cashflow"
            assert 'principal_component' in cf, "Missing principal_component"
            assert 'interest_component' in cf, "Missing interest_component"
            assert cf['date'] == '2026-04-08', f"Expected date 2026-04-08, got {cf['date']}"
    
    def test_holdings_has_actual_cashflows(self):
        """Test that holdings API returns actual_cashflows (repaid cashflows)"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        
        for holding in holdings:
            # Check actual_cashflows exists and has data
            actual_cfs = holding.get('actual_cashflows', [])
            assert len(actual_cfs) == 5, f"Expected 5 actual_cashflows, got {len(actual_cfs)}"
            
            # Verify all actual cashflows are marked as repaid
            for cf in actual_cfs:
                assert cf.get('is_repaid') == True, f"Cashflow {cf['id']} not marked as repaid"
    
    def test_expected_cashflow_values_trade_1(self):
        """Test expected cashflow values for trade 1 (30 Apr 2025, 34 units)"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        
        # Find trade with 34 units (30 Apr 2025)
        trade_34 = next((h for h in holdings if h['units'] == 34), None)
        assert trade_34 is not None, "Trade with 34 units not found"
        
        expected_cfs = trade_34.get('expected_cashflows', [])
        assert len(expected_cfs) == 1
        
        cf = expected_cfs[0]
        # Principal = 34 units * 100000 = 3,400,000
        assert cf['principal_component'] == 3400000, f"Expected principal 3400000, got {cf['principal_component']}"
        # Interest = 34 units * 28149.7 = 957089.8
        assert abs(cf['interest_component'] - 957089.8) < 1, f"Expected interest ~957089.8, got {cf['interest_component']}"
    
    def test_expected_cashflow_values_trade_2(self):
        """Test expected cashflow values for trade 2 (02 May 2025, 31 units)"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        
        # Find trade with 31 units (02 May 2025)
        trade_31 = next((h for h in holdings if h['units'] == 31), None)
        assert trade_31 is not None, "Trade with 31 units not found"
        
        expected_cfs = trade_31.get('expected_cashflows', [])
        assert len(expected_cfs) == 1
        
        cf = expected_cfs[0]
        # Principal = 31 units * 100000 = 3,100,000
        assert cf['principal_component'] == 3100000, f"Expected principal 3100000, got {cf['principal_component']}"
        # Interest = 31 units * 28149.7 = 872640.7
        assert abs(cf['interest_component'] - 872640.7) < 1, f"Expected interest ~872640.7, got {cf['interest_component']}"
    
    def test_expected_cashflow_values_trade_3(self):
        """Test expected cashflow values for trade 3 (07 May 2025, 135 units)"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        
        # Find trade with 135 units (07 May 2025)
        trade_135 = next((h for h in holdings if h['units'] == 135), None)
        assert trade_135 is not None, "Trade with 135 units not found"
        
        expected_cfs = trade_135.get('expected_cashflows', [])
        assert len(expected_cfs) == 1
        
        cf = expected_cfs[0]
        # Principal = 135 units * 100000 = 13,500,000
        assert cf['principal_component'] == 13500000, f"Expected principal 13500000, got {cf['principal_component']}"
        # Interest = 135 units * 28149.7 = 3800209.5
        assert abs(cf['interest_component'] - 3800209.5) < 1, f"Expected interest ~3800209.5, got {cf['interest_component']}"
    
    def test_xirr_values(self):
        """Test that XIRR values are 12.00% as expected"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        holdings = data.get('holdings', [])
        
        for holding in holdings:
            xirr = holding.get('xirr')
            actual_xirr = holding.get('actual_xirr')
            
            assert xirr == 12, f"Expected XIRR 12, got {xirr}"
            assert actual_xirr == 12, f"Expected actual_xirr 12, got {actual_xirr}"
    
    def test_summary_totals(self):
        """Test summary totals for Fali Investor"""
        response = requests.get(
            f"{BASE_URL}/api/holdings/client/client-AAAPU0926D", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        summary = data.get('summary', {})
        
        # Total investment should be ~2.31 Cr (23,076,781)
        assert summary['total_investment'] == 23076781, f"Expected total_investment 23076781, got {summary['total_investment']}"
        
        # Total repaid should be ~2.53 Cr
        assert summary['total_repaid'] > 25000000, f"Expected total_repaid > 25000000, got {summary['total_repaid']}"
        
        # Total profit should be positive
        assert summary['total_profit'] > 0, f"Expected positive profit, got {summary['total_profit']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
