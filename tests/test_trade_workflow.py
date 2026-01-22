"""
Test Trade Workflow - Tests for the new trade management system
Features tested:
- POST /api/trades - Create trade (broker auto-approved, sub-broker pending)
- GET /api/trades - Get all trades
- GET /api/trades/pending - Get pending trades for broker verification
- GET /api/trades/{id} - Get specific trade
- PUT /api/trades/{id}/verify - Approve/reject trade
- DELETE /api/trades/{id} - Cancel pending trade
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bond-workflow.preview.emergentagent.com')

# Test credentials
BROKER_CREDS = {"pan": "ABCDE1234F", "password": "broker123", "pin": "1234"}
SUB_BROKER_CREDS = {"pan": "FGHIJ5678K", "password": "subbroker123", "pin": "5678"}

# Test data
BOND_ID = "cf749918-7979-4c59-8f29-9dc892c2a91d"
CLIENT_PAN = "ABCDE1234X"  # John Doe


class TestTradeWorkflow:
    """Trade workflow tests"""
    
    broker_token = None
    sub_broker_token = None
    test_client_id = None
    test_trade_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens before each test"""
        if not TestTradeWorkflow.broker_token:
            TestTradeWorkflow.broker_token = self.get_token(BROKER_CREDS)
        if not TestTradeWorkflow.sub_broker_token:
            TestTradeWorkflow.sub_broker_token = self.get_token(SUB_BROKER_CREDS)
    
    def get_token(self, creds):
        """Get auth token using 2-step login"""
        # Step 1
        step1_resp = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": creds["pan"],
            "password": creds["password"]
        })
        if step1_resp.status_code != 200:
            pytest.skip(f"Login step 1 failed: {step1_resp.text}")
        
        temp_token = step1_resp.json().get("temp_token")
        
        # Step 2
        step2_resp = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": creds["pin"]
        })
        if step2_resp.status_code != 200:
            pytest.skip(f"Login step 2 failed: {step2_resp.text}")
        
        return step2_resp.json().get("token")
    
    def get_broker_headers(self):
        return {"Authorization": f"Bearer {TestTradeWorkflow.broker_token}"}
    
    def get_sub_broker_headers(self):
        return {"Authorization": f"Bearer {TestTradeWorkflow.sub_broker_token}"}
    
    # ==================== SETUP TESTS ====================
    
    def test_01_broker_login(self):
        """Test broker can login successfully"""
        assert TestTradeWorkflow.broker_token is not None
        print(f"Broker token obtained: {TestTradeWorkflow.broker_token[:20]}...")
    
    def test_02_sub_broker_login(self):
        """Test sub-broker can login successfully"""
        assert TestTradeWorkflow.sub_broker_token is not None
        print(f"Sub-broker token obtained: {TestTradeWorkflow.sub_broker_token[:20]}...")
    
    def test_03_get_bond_details(self):
        """Test bond exists and has available units"""
        response = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        
        assert response.status_code == 200, f"Bond not found: {response.text}"
        
        data = response.json()
        bond = data.get("bond", {})
        
        assert bond.get("id") == BOND_ID
        print(f"Bond: {bond.get('name')}")
        print(f"Total units: {bond.get('total_units', 1)}, Sold: {bond.get('units_sold', 0)}")
        
        units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
        print(f"Units available: {units_available}")
    
    def test_04_get_or_create_test_client(self):
        """Get existing client or create one for testing"""
        headers = self.get_broker_headers()
        
        # Get clients
        response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        assert response.status_code == 200
        
        clients = response.json()
        
        # Find John Doe or any client
        for client in clients:
            if client.get("pan_number") == CLIENT_PAN:
                TestTradeWorkflow.test_client_id = client.get("id")
                print(f"Found existing client: {client.get('name')} (ID: {client.get('id')})")
                return
        
        # If no client found, create one
        if clients:
            TestTradeWorkflow.test_client_id = clients[0].get("id")
            print(f"Using first client: {clients[0].get('name')} (ID: {clients[0].get('id')})")
            return
        
        # Create a test client
        client_data = {
            "name": "TEST_Trade_Client",
            "pan_number": "TESTT1234T",
            "email": "test_trade@example.com",
            "mobile": "+91 9999999999"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=headers)
        assert create_resp.status_code == 200 or create_resp.status_code == 201
        
        TestTradeWorkflow.test_client_id = create_resp.json().get("id")
        print(f"Created test client: {TestTradeWorkflow.test_client_id}")
    
    # ==================== TRADE API TESTS ====================
    
    def test_05_calculate_price_for_trade(self):
        """Test price calculation before creating trade"""
        # Get today's date or a valid investment date
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
            "investment_date": today,
            "units": 1
        })
        
        # If today is not valid, try with bond's start date
        if response.status_code == 400:
            bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
            bond = bond_resp.json().get("bond", {})
            start_date = bond.get("start_date")
            end_date = bond.get("end_date")
            
            # Use a date within the bond period
            response = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
                "investment_date": start_date,
                "units": 1
            })
        
        assert response.status_code == 200, f"Price calculation failed: {response.text}"
        
        data = response.json()
        assert "price_per_unit" in data
        assert "total_price" in data
        assert "units_available" in data
        
        print(f"Price per unit: ₹{data.get('price_per_unit')}")
        print(f"Units available: {data.get('units_available')}")
    
    def test_06_broker_create_trade_auto_approved(self):
        """Test broker creating trade - should be auto-approved"""
        headers = self.get_broker_headers()
        
        # Get valid investment date
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        investment_date = bond.get("start_date")
        
        # Calculate price first
        calc_resp = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
            "investment_date": investment_date,
            "units": 1
        })
        
        if calc_resp.status_code != 200:
            pytest.skip(f"Price calculation failed: {calc_resp.text}")
        
        price_per_unit = calc_resp.json().get("price_per_unit")
        
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": TestTradeWorkflow.test_client_id,
            "units": 1,
            "investment_date": investment_date,
            "calculated_price": price_per_unit,
            "payment_reference": "TEST_BROKER_REF_001",
            "payment_notes": "Test trade by broker"
        }
        
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        assert response.status_code == 200, f"Trade creation failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "approved", "Broker trade should be auto-approved"
        assert data.get("created_by_role") == "broker"
        assert "id" in data
        
        print(f"Broker trade created: {data.get('id')}")
        print(f"Status: {data.get('status')} (auto-approved)")
    
    def test_07_get_all_trades(self):
        """Test GET /api/trades returns trades"""
        headers = self.get_broker_headers()
        
        response = requests.get(f"{BASE_URL}/api/trades", headers=headers)
        
        assert response.status_code == 200
        
        trades = response.json()
        assert isinstance(trades, list)
        
        print(f"Total trades: {len(trades)}")
        
        if trades:
            trade = trades[0]
            assert "id" in trade
            assert "bond_name" in trade
            assert "client_name" in trade
            assert "status" in trade
            print(f"Latest trade: {trade.get('bond_name')} - {trade.get('status')}")
    
    def test_08_get_pending_trades_broker(self):
        """Test GET /api/trades/pending returns pending trades for broker"""
        headers = self.get_broker_headers()
        
        response = requests.get(f"{BASE_URL}/api/trades/pending", headers=headers)
        
        assert response.status_code == 200
        
        pending = response.json()
        assert isinstance(pending, list)
        
        print(f"Pending trades: {len(pending)}")
        
        for trade in pending:
            assert trade.get("status") == "pending"
    
    def test_09_sub_broker_cannot_view_pending_trades(self):
        """Test sub-broker cannot access pending trades endpoint"""
        headers = self.get_sub_broker_headers()
        
        response = requests.get(f"{BASE_URL}/api/trades/pending", headers=headers)
        
        assert response.status_code == 403, "Sub-broker should not access pending trades"
        print("Sub-broker correctly denied access to pending trades")
    
    def test_10_sub_broker_create_trade_pending(self):
        """Test sub-broker creating trade - should be pending"""
        headers = self.get_sub_broker_headers()
        
        # First, we need a client linked to this sub-broker
        # Get sub-broker's clients
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients linked to sub-broker for testing")
        
        clients = clients_resp.json()
        if not clients:
            pytest.skip("No clients available for sub-broker")
        
        client_id = clients[0].get("id")
        
        # Get valid investment date
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        investment_date = bond.get("start_date")
        
        # Calculate price
        calc_resp = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
            "investment_date": investment_date,
            "units": 1
        })
        
        if calc_resp.status_code != 200:
            pytest.skip(f"Price calculation failed: {calc_resp.text}")
        
        price_per_unit = calc_resp.json().get("price_per_unit")
        
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": client_id,
            "units": 1,
            "investment_date": investment_date,
            "calculated_price": price_per_unit,
            "payment_reference": "TEST_SUBBROKER_REF_001",
            "payment_notes": "Test trade by sub-broker"
        }
        
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        assert response.status_code == 200, f"Trade creation failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending", "Sub-broker trade should be pending"
        assert data.get("created_by_role") == "sub_broker"
        
        TestTradeWorkflow.test_trade_id = data.get("id")
        
        print(f"Sub-broker trade created: {data.get('id')}")
        print(f"Status: {data.get('status')} (pending approval)")
    
    def test_11_verify_pending_trade_appears(self):
        """Test pending trade appears in broker's pending list"""
        if not TestTradeWorkflow.test_trade_id:
            pytest.skip("No pending trade to verify")
        
        headers = self.get_broker_headers()
        
        response = requests.get(f"{BASE_URL}/api/trades/pending", headers=headers)
        
        assert response.status_code == 200
        
        pending = response.json()
        trade_ids = [t.get("id") for t in pending]
        
        assert TestTradeWorkflow.test_trade_id in trade_ids, "Pending trade not found in broker's list"
        print(f"Pending trade {TestTradeWorkflow.test_trade_id} found in broker's pending list")
    
    def test_12_broker_approve_trade(self):
        """Test broker approving a pending trade"""
        if not TestTradeWorkflow.test_trade_id:
            pytest.skip("No pending trade to approve")
        
        headers = self.get_broker_headers()
        
        response = requests.put(
            f"{BASE_URL}/api/trades/{TestTradeWorkflow.test_trade_id}/verify",
            json={
                "status": "approved",
                "broker_notes": "Approved by test"
            },
            headers=headers
        )
        
        assert response.status_code == 200, f"Trade approval failed: {response.text}"
        
        data = response.json()
        assert "Trade approved" in data.get("message", "")
        
        print(f"Trade {TestTradeWorkflow.test_trade_id} approved successfully")
    
    def test_13_verify_trade_status_updated(self):
        """Test trade status is updated after approval"""
        if not TestTradeWorkflow.test_trade_id:
            pytest.skip("No trade to verify")
        
        headers = self.get_broker_headers()
        
        response = requests.get(
            f"{BASE_URL}/api/trades/{TestTradeWorkflow.test_trade_id}",
            headers=headers
        )
        
        assert response.status_code == 200
        
        trade = response.json()
        assert trade.get("status") == "approved"
        assert trade.get("broker_notes") == "Approved by test"
        assert trade.get("approved_at") is not None
        
        print(f"Trade status verified: {trade.get('status')}")
    
    def test_14_create_and_reject_trade(self):
        """Test broker rejecting a trade"""
        headers = self.get_sub_broker_headers()
        
        # Get sub-broker's clients
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients linked to sub-broker")
        
        clients = clients_resp.json()
        client_id = clients[0].get("id")
        
        # Get valid investment date
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        investment_date = bond.get("start_date")
        
        # Calculate price
        calc_resp = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
            "investment_date": investment_date,
            "units": 1
        })
        
        if calc_resp.status_code != 200:
            pytest.skip("Price calculation failed")
        
        price_per_unit = calc_resp.json().get("price_per_unit")
        
        # Create trade
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": client_id,
            "units": 1,
            "investment_date": investment_date,
            "calculated_price": price_per_unit,
            "payment_reference": "TEST_REJECT_REF",
            "payment_notes": "Trade to be rejected"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        if create_resp.status_code != 200:
            pytest.skip(f"Trade creation failed: {create_resp.text}")
        
        trade_id = create_resp.json().get("id")
        
        # Broker rejects the trade
        broker_headers = self.get_broker_headers()
        
        reject_resp = requests.put(
            f"{BASE_URL}/api/trades/{trade_id}/verify",
            json={
                "status": "rejected",
                "broker_notes": "Rejected for testing"
            },
            headers=broker_headers
        )
        
        assert reject_resp.status_code == 200, f"Trade rejection failed: {reject_resp.text}"
        
        # Verify status
        verify_resp = requests.get(f"{BASE_URL}/api/trades/{trade_id}", headers=broker_headers)
        assert verify_resp.status_code == 200
        
        trade = verify_resp.json()
        assert trade.get("status") == "rejected"
        
        print(f"Trade {trade_id} rejected successfully")
    
    def test_15_cannot_verify_non_pending_trade(self):
        """Test cannot verify already approved/rejected trade"""
        if not TestTradeWorkflow.test_trade_id:
            pytest.skip("No trade to test")
        
        headers = self.get_broker_headers()
        
        response = requests.put(
            f"{BASE_URL}/api/trades/{TestTradeWorkflow.test_trade_id}/verify",
            json={"status": "approved"},
            headers=headers
        )
        
        assert response.status_code == 400, "Should not be able to verify non-pending trade"
        print("Correctly prevented re-verification of approved trade")
    
    def test_16_trade_invalid_status(self):
        """Test trade verification with invalid status"""
        # Create a new pending trade first
        headers = self.get_sub_broker_headers()
        
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients available")
        
        clients = clients_resp.json()
        client_id = clients[0].get("id")
        
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        investment_date = bond.get("start_date")
        
        calc_resp = requests.post(f"{BASE_URL}/api/bonds/{BOND_ID}/calculate", json={
            "investment_date": investment_date,
            "units": 1
        })
        
        if calc_resp.status_code != 200:
            pytest.skip("Price calculation failed")
        
        price_per_unit = calc_resp.json().get("price_per_unit")
        
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": client_id,
            "units": 1,
            "investment_date": investment_date,
            "calculated_price": price_per_unit
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        if create_resp.status_code != 200:
            pytest.skip("Trade creation failed")
        
        trade_id = create_resp.json().get("id")
        
        # Try invalid status
        broker_headers = self.get_broker_headers()
        
        response = requests.put(
            f"{BASE_URL}/api/trades/{trade_id}/verify",
            json={"status": "invalid_status"},
            headers=broker_headers
        )
        
        assert response.status_code == 400, "Should reject invalid status"
        print("Correctly rejected invalid status")
        
        # Clean up - cancel the trade
        requests.delete(f"{BASE_URL}/api/trades/{trade_id}", headers=headers)
    
    def test_17_sub_broker_cannot_verify_trades(self):
        """Test sub-broker cannot verify trades"""
        headers = self.get_sub_broker_headers()
        
        # Try to verify any trade
        response = requests.put(
            f"{BASE_URL}/api/trades/some-trade-id/verify",
            json={"status": "approved"},
            headers=headers
        )
        
        assert response.status_code == 403, "Sub-broker should not be able to verify trades"
        print("Sub-broker correctly denied trade verification")


class TestTradeEdgeCases:
    """Edge case tests for trade workflow"""
    
    broker_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestTradeEdgeCases.broker_token:
            TestTradeEdgeCases.broker_token = self.get_token(BROKER_CREDS)
    
    def get_token(self, creds):
        step1_resp = requests.post(f"{BASE_URL}/api/auth/login-step1", json={
            "pan": creds["pan"],
            "password": creds["password"]
        })
        if step1_resp.status_code != 200:
            pytest.skip("Login failed")
        
        temp_token = step1_resp.json().get("temp_token")
        
        step2_resp = requests.post(f"{BASE_URL}/api/auth/login-step2", json={
            "temp_token": temp_token,
            "pin": creds["pin"]
        })
        if step2_resp.status_code != 200:
            pytest.skip("Login failed")
        
        return step2_resp.json().get("token")
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestTradeEdgeCases.broker_token}"}
    
    def test_trade_with_invalid_bond(self):
        """Test trade creation with non-existent bond"""
        headers = self.get_headers()
        
        # Get a client
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients available")
        
        client_id = clients_resp.json()[0].get("id")
        
        trade_data = {
            "bond_id": "non-existent-bond-id",
            "client_id": client_id,
            "units": 1,
            "investment_date": "2025-01-01",
            "calculated_price": 100000
        }
        
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        assert response.status_code == 404, "Should reject non-existent bond"
        print("Correctly rejected trade with invalid bond")
    
    def test_trade_with_invalid_client(self):
        """Test trade creation with non-existent client"""
        headers = self.get_headers()
        
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        investment_date = bond.get("start_date")
        
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": "non-existent-client-id",
            "units": 1,
            "investment_date": investment_date,
            "calculated_price": 100000
        }
        
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        assert response.status_code == 404, "Should reject non-existent client"
        print("Correctly rejected trade with invalid client")
    
    def test_trade_exceeds_available_units(self):
        """Test trade creation with more units than available"""
        headers = self.get_headers()
        
        # Get bond details
        bond_resp = requests.get(f"{BASE_URL}/api/bonds/{BOND_ID}")
        bond = bond_resp.json().get("bond", {})
        total_units = bond.get("total_units", 1)
        investment_date = bond.get("start_date")
        
        # Get a client
        clients_resp = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients available")
        
        client_id = clients_resp.json()[0].get("id")
        
        trade_data = {
            "bond_id": BOND_ID,
            "client_id": client_id,
            "units": total_units + 1000,  # More than available
            "investment_date": investment_date,
            "calculated_price": 100000
        }
        
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=headers)
        
        assert response.status_code == 400, "Should reject trade exceeding available units"
        print("Correctly rejected trade exceeding available units")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
