"""
Dashboard Analytics API Tests
Tests for the new Analytics Dashboard feature with 5 endpoints:
- /api/dashboard/summary
- /api/dashboard/clients-by-city
- /api/dashboard/aum-distribution
- /api/dashboard/activity-log
- /api/dashboard/monthly-stats
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDashboardAuth:
    """Test authentication for dashboard endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = None
    
    def get_broker_token(self):
        """Authenticate as broker and get token"""
        # Step 1: Login with PAN and password
        step1_response = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        assert step1_response.status_code == 200, f"Step 1 failed: {step1_response.text}"
        temp_token = step1_response.json().get("temp_token")
        
        # Step 2: Login with PIN
        step2_response = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": temp_token, "pin": self.broker_pin}
        )
        assert step2_response.status_code == 200, f"Step 2 failed: {step2_response.text}"
        return step2_response.json().get("token")
    
    def test_dashboard_requires_auth(self):
        """Test that dashboard endpoints require authentication"""
        endpoints = [
            "/api/dashboard/summary",
            "/api/dashboard/clients-by-city",
            "/api/dashboard/aum-distribution",
            "/api/dashboard/activity-log",
            "/api/dashboard/monthly-stats"
        ]
        
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code in [401, 403], f"{endpoint} should require auth, got {response.status_code}"
            print(f"✓ {endpoint} correctly requires authentication")


class TestDashboardSummary:
    """Test /api/dashboard/summary endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup and authenticate"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = self._get_broker_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_broker_token(self):
        """Authenticate as broker"""
        step1 = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1.status_code != 200:
            pytest.skip("Could not authenticate broker")
        
        step2 = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": step1.json()["temp_token"], "pin": self.broker_pin}
        )
        if step2.status_code != 200:
            pytest.skip("Could not complete broker authentication")
        
        return step2.json()["token"]
    
    def test_summary_endpoint_returns_200(self):
        """Test summary endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Summary endpoint returns 200")
    
    def test_summary_has_required_fields(self):
        """Test summary response has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/summary",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        assert "clients" in data, "Missing 'clients' field"
        assert "sub_brokers" in data, "Missing 'sub_brokers' field"
        assert "opportunities" in data, "Missing 'opportunities' field"
        assert "aum" in data, "Missing 'aum' field"
        assert "trades_count" in data, "Missing 'trades_count' field"
        
        # Check nested fields
        assert "total" in data["clients"], "Missing 'clients.total'"
        assert "active" in data["clients"], "Missing 'clients.active'"
        assert "total" in data["sub_brokers"], "Missing 'sub_brokers.total'"
        assert "active" in data["sub_brokers"], "Missing 'sub_brokers.active'"
        assert "bonds" in data["opportunities"], "Missing 'opportunities.bonds'"
        assert "real_estate" in data["opportunities"], "Missing 'opportunities.real_estate'"
        assert "total" in data["aum"], "Missing 'aum.total'"
        assert "bonds" in data["aum"], "Missing 'aum.bonds'"
        assert "real_estate" in data["aum"], "Missing 'aum.real_estate'"
        
        print(f"✓ Summary has all required fields")
        print(f"  - Clients: {data['clients']['total']} total, {data['clients']['active']} active")
        print(f"  - Sub-brokers: {data['sub_brokers']['total']} total")
        print(f"  - AUM: {data['aum']['total']}")
    
    def test_summary_data_types(self):
        """Test summary response has correct data types"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/summary",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check data types
        assert isinstance(data["clients"]["total"], int), "clients.total should be int"
        assert isinstance(data["clients"]["active"], int), "clients.active should be int"
        assert isinstance(data["sub_brokers"]["total"], int), "sub_brokers.total should be int"
        assert isinstance(data["aum"]["total"], (int, float)), "aum.total should be numeric"
        assert isinstance(data["trades_count"], int), "trades_count should be int"
        
        print("✓ Summary data types are correct")


class TestDashboardClientsByCity:
    """Test /api/dashboard/clients-by-city endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup and authenticate"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = self._get_broker_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_broker_token(self):
        """Authenticate as broker"""
        step1 = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1.status_code != 200:
            pytest.skip("Could not authenticate broker")
        
        step2 = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": step1.json()["temp_token"], "pin": self.broker_pin}
        )
        if step2.status_code != 200:
            pytest.skip("Could not complete broker authentication")
        
        return step2.json()["token"]
    
    def test_clients_by_city_returns_200(self):
        """Test clients-by-city endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/clients-by-city",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Clients-by-city endpoint returns 200")
    
    def test_clients_by_city_returns_list(self):
        """Test clients-by-city returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/clients-by-city",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Clients-by-city returns list with {len(data)} cities")
        
        if len(data) > 0:
            # Check structure of first item
            first_item = data[0]
            assert "city" in first_item, "Each item should have 'city' field"
            assert "count" in first_item, "Each item should have 'count' field"
            assert isinstance(first_item["count"], int), "count should be int"
            print(f"  - Top city: {first_item['city']} with {first_item['count']} clients")


class TestDashboardAumDistribution:
    """Test /api/dashboard/aum-distribution endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup and authenticate"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = self._get_broker_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_broker_token(self):
        """Authenticate as broker"""
        step1 = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1.status_code != 200:
            pytest.skip("Could not authenticate broker")
        
        step2 = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": step1.json()["temp_token"], "pin": self.broker_pin}
        )
        if step2.status_code != 200:
            pytest.skip("Could not complete broker authentication")
        
        return step2.json()["token"]
    
    def test_aum_distribution_returns_200(self):
        """Test aum-distribution endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/aum-distribution",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ AUM distribution endpoint returns 200")
    
    def test_aum_distribution_has_required_fields(self):
        """Test aum-distribution has by_asset_class and by_subbroker"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/aum-distribution",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "by_asset_class" in data, "Missing 'by_asset_class' field"
        assert "by_subbroker" in data, "Missing 'by_subbroker' field"
        
        assert isinstance(data["by_asset_class"], list), "by_asset_class should be a list"
        assert isinstance(data["by_subbroker"], list), "by_subbroker should be a list"
        
        print(f"✓ AUM distribution has required fields")
        print(f"  - Asset classes: {len(data['by_asset_class'])}")
        print(f"  - Sub-brokers: {len(data['by_subbroker'])}")
    
    def test_aum_by_asset_class_structure(self):
        """Test by_asset_class has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/aum-distribution",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        for item in data["by_asset_class"]:
            assert "name" in item, "Each asset class should have 'name'"
            assert "value" in item, "Each asset class should have 'value'"
            assert isinstance(item["value"], (int, float)), "value should be numeric"
        
        print("✓ Asset class structure is correct")
        for item in data["by_asset_class"]:
            print(f"  - {item['name']}: {item['value']}")


class TestDashboardActivityLog:
    """Test /api/dashboard/activity-log endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup and authenticate"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = self._get_broker_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_broker_token(self):
        """Authenticate as broker"""
        step1 = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1.status_code != 200:
            pytest.skip("Could not authenticate broker")
        
        step2 = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": step1.json()["temp_token"], "pin": self.broker_pin}
        )
        if step2.status_code != 200:
            pytest.skip("Could not complete broker authentication")
        
        return step2.json()["token"]
    
    def test_activity_log_returns_200(self):
        """Test activity-log endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activity-log",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Activity log endpoint returns 200")
    
    def test_activity_log_returns_list(self):
        """Test activity-log returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activity-log",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Activity log returns list with {len(data)} activities")
    
    def test_activity_log_item_structure(self):
        """Test activity log items have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activity-log?limit=5",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            first_item = data[0]
            assert "type" in first_item, "Activity should have 'type'"
            assert "status" in first_item, "Activity should have 'status'"
            assert "description" in first_item, "Activity should have 'description'"
            assert "amount" in first_item, "Activity should have 'amount'"
            assert "timestamp" in first_item, "Activity should have 'timestamp'"
            
            print(f"✓ Activity log item structure is correct")
            print(f"  - First activity: {first_item['type']} - {first_item['description'][:50]}...")
    
    def test_activity_log_limit_parameter(self):
        """Test activity-log respects limit parameter"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/activity-log?limit=3",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) <= 3, f"Expected max 3 items, got {len(data)}"
        print(f"✓ Activity log respects limit parameter (got {len(data)} items)")


class TestDashboardMonthlyStats:
    """Test /api/dashboard/monthly-stats endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup and authenticate"""
        self.broker_pan = "BROKER001A"
        self.broker_password = "broker123"
        self.broker_pin = "1234"
        self.token = self._get_broker_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def _get_broker_token(self):
        """Authenticate as broker"""
        step1 = requests.post(
            f"{BASE_URL}/api/auth/login-step1",
            json={"pan": self.broker_pan, "password": self.broker_password}
        )
        if step1.status_code != 200:
            pytest.skip("Could not authenticate broker")
        
        step2 = requests.post(
            f"{BASE_URL}/api/auth/login-step2",
            json={"temp_token": step1.json()["temp_token"], "pin": self.broker_pin}
        )
        if step2.status_code != 200:
            pytest.skip("Could not complete broker authentication")
        
        return step2.json()["token"]
    
    def test_monthly_stats_returns_200(self):
        """Test monthly-stats endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/monthly-stats",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Monthly stats endpoint returns 200")
    
    def test_monthly_stats_returns_12_months(self):
        """Test monthly-stats returns data for all 12 months"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/monthly-stats",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 12, f"Expected 12 months, got {len(data)}"
        
        expected_months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        actual_months = [item['month'] for item in data]
        assert actual_months == expected_months, f"Months mismatch: {actual_months}"
        
        print("✓ Monthly stats returns all 12 months")
    
    def test_monthly_stats_item_structure(self):
        """Test monthly stats items have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/monthly-stats",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            assert "month" in item, "Each item should have 'month'"
            assert "investments" in item, "Each item should have 'investments'"
            assert "trades" in item, "Each item should have 'trades'"
            assert "clients" in item, "Each item should have 'clients'"
            assert isinstance(item["investments"], (int, float)), "investments should be numeric"
            assert isinstance(item["trades"], (int, float)), "trades should be numeric"
            assert isinstance(item["clients"], int), "clients should be int"
        
        print("✓ Monthly stats item structure is correct")
    
    def test_monthly_stats_year_parameter(self):
        """Test monthly-stats accepts year parameter"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/monthly-stats?year=2024",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert len(data) == 12, "Should return 12 months for any year"
        print("✓ Monthly stats accepts year parameter")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
