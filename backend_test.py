#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List

class BondFlowAPITester:
    def __init__(self, base_url="https://financial-download.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_bond_id = None
        self.test_results = []

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED {details}")
        else:
            print(f"❌ {name}: FAILED {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_api_health(self):
        """Test basic API connectivity"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                data = response.json()
                details += f", Message: {data.get('message', 'N/A')}"
            self.log_test("API Health Check", success, details)
            return success
        except Exception as e:
            self.log_test("API Health Check", False, f"Error: {str(e)}")
            return False

    def test_create_bond(self):
        """Test bond creation with comprehensive data"""
        try:
            # Create test bond data
            start_date = datetime.now().strftime("%Y-%m-%d")
            end_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
            
            bond_data = {
                "name": "Test NCD Bond 2025",
                "start_date": start_date,
                "end_date": end_date,
                "principal_amount": 1000000.0,
                "coupon_rate": 8.5,
                "primary_irr": 9.0,
                "secondary_irr": 8.5,
                "interest_payment_frequency": "quarterly",
                "principal_payments": [
                    {"date": end_date, "percentage": 100.0}
                ],
                "interest_payments": [
                    {"date": (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d"), "amount": 21250.0},
                    {"date": (datetime.now() + timedelta(days=180)).strftime("%Y-%m-%d"), "amount": 21250.0},
                    {"date": (datetime.now() + timedelta(days=270)).strftime("%Y-%m-%d"), "amount": 21250.0},
                    {"date": end_date, "amount": 21250.0}
                ]
            }

            response = requests.post(
                f"{self.api_url}/bonds",
                json=bond_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                data = response.json()
                self.created_bond_id = data.get("id")
                details = f"Bond ID: {self.created_bond_id}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
            
            self.log_test("Create Bond", success, details)
            return success
        except Exception as e:
            self.log_test("Create Bond", False, f"Error: {str(e)}")
            return False

    def test_get_bonds(self):
        """Test retrieving all bonds"""
        try:
            response = requests.get(f"{self.api_url}/bonds", timeout=10)
            success = response.status_code == 200
            
            if success:
                bonds = response.json()
                details = f"Found {len(bonds)} bonds"
                if self.created_bond_id:
                    found_test_bond = any(bond.get("id") == self.created_bond_id for bond in bonds)
                    details += f", Test bond found: {found_test_bond}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
            
            self.log_test("Get All Bonds", success, details)
            return success
        except Exception as e:
            self.log_test("Get All Bonds", False, f"Error: {str(e)}")
            return False

    def test_get_bond_details(self):
        """Test retrieving specific bond details"""
        if not self.created_bond_id:
            self.log_test("Get Bond Details", False, "No bond ID available")
            return False
        
        try:
            response = requests.get(f"{self.api_url}/bonds/{self.created_bond_id}", timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                bond = data.get("bond", {})
                calculated_irr = data.get("calculated_primary_irr")
                details = f"Bond: {bond.get('name')}, Calculated IRR: {calculated_irr}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
            
            self.log_test("Get Bond Details", success, details)
            return success
        except Exception as e:
            self.log_test("Get Bond Details", False, f"Error: {str(e)}")
            return False

    def test_secondary_market_calculation(self):
        """Test secondary market price calculation"""
        if not self.created_bond_id:
            self.log_test("Secondary Market Calculation", False, "No bond ID available")
            return False
        
        try:
            # Calculate price for investment 30 days from now
            investment_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            
            calc_data = {
                "investment_date": investment_date
            }
            
            response = requests.post(
                f"{self.api_url}/bonds/{self.created_bond_id}/calculate",
                json=calc_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            success = response.status_code == 200
            
            if success:
                data = response.json()
                price = data.get("price_to_pay", 0)
                broker_margin = data.get("broker_margin", 0)
                details = f"Price: ₹{price:,.2f}, Broker Margin: ₹{broker_margin:,.2f}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
            
            self.log_test("Secondary Market Calculation", success, details)
            return success
        except Exception as e:
            self.log_test("Secondary Market Calculation", False, f"Error: {str(e)}")
            return False

    def test_validation_errors(self):
        """Test API validation for invalid data"""
        try:
            # Test invalid principal payments (not summing to 100%)
            invalid_bond_data = {
                "name": "Invalid Bond",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "principal_amount": 1000000.0,
                "coupon_rate": 8.5,
                "primary_irr": 9.0,
                "secondary_irr": 8.5,
                "interest_payment_frequency": "quarterly",
                "principal_payments": [
                    {"date": "2025-12-31", "percentage": 50.0}  # Only 50%, should fail
                ],
                "interest_payments": [
                    {"date": "2025-03-31", "amount": 21250.0}
                ]
            }

            response = requests.post(
                f"{self.api_url}/bonds",
                json=invalid_bond_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            # Should fail with 422 validation error
            success = response.status_code == 422
            details = f"Status: {response.status_code} (expected 422 for validation error)"
            
            self.log_test("Validation Error Handling", success, details)
            return success
        except Exception as e:
            self.log_test("Validation Error Handling", False, f"Error: {str(e)}")
            return False

    def test_delete_bond(self):
        """Test bond deletion"""
        if not self.created_bond_id:
            self.log_test("Delete Bond", False, "No bond ID available")
            return False
        
        try:
            response = requests.delete(f"{self.api_url}/bonds/{self.created_bond_id}", timeout=10)
            success = response.status_code == 200
            
            if success:
                details = "Bond deleted successfully"
                # Verify deletion by trying to get the bond
                verify_response = requests.get(f"{self.api_url}/bonds/{self.created_bond_id}", timeout=10)
                if verify_response.status_code == 404:
                    details += ", Deletion verified"
                else:
                    success = False
                    details += f", Deletion NOT verified (status: {verify_response.status_code})"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
            
            self.log_test("Delete Bond", success, details)
            return success
        except Exception as e:
            self.log_test("Delete Bond", False, f"Error: {str(e)}")
            return False

    def test_xirr_calculation_accuracy(self):
        """Test XIRR calculation with known values"""
        try:
            # Create a bond with known cashflows for XIRR verification
            start_date = "2025-01-01"
            end_date = "2025-12-31"
            
            bond_data = {
                "name": "XIRR Test Bond",
                "start_date": start_date,
                "end_date": end_date,
                "principal_amount": 100000.0,
                "coupon_rate": 10.0,
                "primary_irr": 10.0,
                "secondary_irr": 9.5,
                "interest_payment_frequency": "annual",
                "principal_payments": [
                    {"date": end_date, "percentage": 100.0}
                ],
                "interest_payments": [
                    {"date": end_date, "amount": 10000.0}
                ]
            }

            # Create bond
            response = requests.post(
                f"{self.api_url}/bonds",
                json=bond_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_test("XIRR Calculation Accuracy", False, f"Failed to create test bond: {response.status_code}")
                return False
            
            bond_id = response.json().get("id")
            
            # Get bond details to check calculated IRR
            details_response = requests.get(f"{self.api_url}/bonds/{bond_id}", timeout=10)
            
            if details_response.status_code == 200:
                data = details_response.json()
                calculated_irr = data.get("calculated_primary_irr")
                
                # Clean up
                requests.delete(f"{self.api_url}/bonds/{bond_id}", timeout=10)
                
                if calculated_irr is not None:
                    # Should be close to 10% (allowing for small calculation differences)
                    success = abs(calculated_irr - 10.0) < 0.5
                    details = f"Calculated IRR: {calculated_irr:.2f}% (expected ~10%)"
                else:
                    success = False
                    details = "No calculated IRR returned"
            else:
                success = False
                details = f"Failed to get bond details: {details_response.status_code}"
            
            self.log_test("XIRR Calculation Accuracy", success, details)
            return success
        except Exception as e:
            self.log_test("XIRR Calculation Accuracy", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting BondFlow Pro Backend API Tests")
        print("=" * 50)
        
        # Test sequence
        tests = [
            self.test_api_health,
            self.test_create_bond,
            self.test_get_bonds,
            self.test_get_bond_details,
            self.test_secondary_market_calculation,
            self.test_validation_errors,
            self.test_xirr_calculation_accuracy,
            self.test_delete_bond
        ]
        
        for test in tests:
            test()
            print()
        
        # Summary
        print("=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check details above.")
            return 1

    def get_test_summary(self):
        """Get test summary for reporting"""
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0,
            "test_results": self.test_results
        }

def main():
    tester = BondFlowAPITester()
    exit_code = tester.run_all_tests()
    
    # Save test results
    summary = tester.get_test_summary()
    with open("/app/backend_test_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())