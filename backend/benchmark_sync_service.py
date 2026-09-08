"""
Benchmark Data Sync Service
Fetches benchmark NAV data from PulseLabs API and stores in MongoDB.
Uses subprocess+curl for reliable API communication.
Supports:
- One-time backfill from a specific date
- Daily scheduled sync
"""

import os
import asyncio
import logging
import subprocess
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from motor.motor_asyncio import AsyncIOMotorClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PulseLabs API Configuration
PULSELABS_LOGIN_URL = "https://pulsedb-qa.pulselabs.co.in/rest/api/v1/partner_login"
PULSELABS_BM_DATA_URL = "https://pulsedb-qa.pulselabs.co.in/rest/api/v1/mf/bm_data"
PULSELABS_CREDENTIALS = {
    "partner": "Kinntegra-MFDB",
    "key": "Kinntegra-MFDB"
}

# Rate limiting - API locks for 10 seconds between calls
API_CALL_DELAY = 12  # seconds between API calls


def curl_post(url: str, data: dict, timeout: int = 60) -> dict:
    """
    Make a POST request using curl subprocess, with urllib fallback.
    This bypasses any session/cookie issues with Python HTTP libraries.
    """
    # Try subprocess curl first
    try:
        result = subprocess.run([
            'curl', '-s', '-X', 'POST',
            url,
            '-H', 'Content-Type: application/json',
            '-d', json.dumps(data),
            '--max-time', str(timeout)
        ], capture_output=True, text=True, timeout=timeout+10)
        
        if result.returncode == 0 and result.stdout:
            return json.loads(result.stdout)
        else:
            logger.warning(f"Curl failed, trying urllib fallback. stderr: {result.stderr}")
    except FileNotFoundError:
        logger.warning("curl not found, using urllib fallback")
    except subprocess.TimeoutExpired:
        logger.warning(f"Curl timeout for {url}, trying urllib fallback")
    except Exception as e:
        logger.warning(f"Curl error: {e}, trying urllib fallback")
    
    # Fallback to urllib (built-in, no external dependencies)
    try:
        import urllib.request
        import urllib.error
        
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        logger.error(f"HTTP Error {e.code}: {e.reason}")
        # Try to read error response body
        try:
            error_body = json.loads(e.read().decode('utf-8'))
            return error_body
        except:
            return {}
    except Exception as e:
        logger.error(f"urllib error: {e}")
        return {}


class BenchmarkSyncService:
    def __init__(self, mongo_url: str = None, db_name: str = "bond_platform"):
        self.mongo_url = mongo_url or os.environ.get('MONGO_URL')
        self.db_name = db_name
        self.client = None
        self.db = None
        self.auth_token = None
        
    async def connect(self):
        """Connect to MongoDB"""
        if not self.client:
            self.client = AsyncIOMotorClient(self.mongo_url)
            self.db = self.client[self.db_name]
            logger.info(f"Connected to MongoDB database: {self.db_name}")
    
    async def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            
    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from PulseLabs API"""
        data = curl_post(PULSELABS_LOGIN_URL, PULSELABS_CREDENTIALS)
        
        status_code = data.get("status", {}).get("code")
        
        if status_code == 200 and "data" in data and "auth" in data["data"]:
            self.auth_token = data["data"]["auth"]
            logger.info("Successfully obtained auth token")
            return self.auth_token
        
        logger.error(f"Auth failed: {data}")
        return None
    
    async def fetch_benchmark_data(self, date: str, retry_count: int = 0) -> List[Dict]:
        """
        Fetch benchmark data for a specific date.
        
        Args:
            date: Date in YYYY-MM-DD format
            retry_count: Number of retries attempted
            
        Returns:
            List of benchmark records, None for retry, empty list for no data
        """
        if not self.auth_token:
            self.get_auth_token()
            await asyncio.sleep(API_CALL_DELAY)  # Wait after login
            
        if not self.auth_token:
            logger.error("No auth token available")
            return []
            
        data = curl_post(
            PULSELABS_BM_DATA_URL,
            {"auth": self.auth_token, "date": date}
        )
        
        # Check for rate limiting
        if "Repeated API calls" in data.get("message", ""):
            if retry_count < 2:
                logger.warning(f"Rate limited for date {date}, waiting and retrying...")
                await asyncio.sleep(API_CALL_DELAY)
                return await self.fetch_benchmark_data(date, retry_count + 1)
            logger.error(f"Rate limited for date {date} after {retry_count} retries")
            return None
        
        # Check for auth error
        status = data.get("status", {})
        if status.get("code") == 401:
            if retry_count < 1:
                logger.warning(f"Auth error for date {date}, refreshing token...")
                self.auth_token = None
                await asyncio.sleep(API_CALL_DELAY)
                return await self.fetch_benchmark_data(date, retry_count + 1)
            logger.error(f"Auth error for date {date}: {status.get('message')}")
            return []
        
        if status.get("code") == 200:
            records = data.get("data", [])
            if records:
                logger.info(f"Fetched {len(records)} benchmark records for {date}")
            else:
                logger.info(f"No benchmark data for {date} (may be weekend/holiday)")
            return records
        else:
            logger.warning(f"Unexpected response for {date}: {data}")
            return []
    
    async def store_benchmark_data(self, date: str, records: List[Dict]) -> Dict:
        """
        Store benchmark records in MongoDB.
        """
        if not records:
            return {"added": 0, "updated": 0, "date": date}
            
        await self.connect()
        
        stats = {"added": 0, "updated": 0, "date": date}
        
        for record in records:
            benchmark_code = record.get("final_benchmark")
            benchmark_value = record.get("benchmark_value")
            
            if not benchmark_code or benchmark_value is None:
                continue
                
            # Create record for storage
            bm_record = {
                "benchmark_code": benchmark_code,
                "benchmark_value": float(benchmark_value),
                "as_on_date": date,
                "alt_benchmark_code": benchmark_code.replace("OB", "AB") if benchmark_code.startswith("OB") else benchmark_code.replace("AB", "OB"),
                "source": "pulselabs_api",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Upsert into database
            result = await self.db.benchmark_values.update_one(
                {"benchmark_code": benchmark_code, "as_on_date": date},
                {"$set": bm_record},
                upsert=True
            )
            
            if result.upserted_id:
                stats["added"] += 1
            elif result.modified_count > 0:
                stats["updated"] += 1
                
        logger.info(f"Stored benchmark data for {date}: {stats['added']} added, {stats['updated']} updated")
        return stats
    
    async def sync_date_range(self, start_date: str, end_date: str = None) -> Dict:
        """
        Sync benchmark data for a date range.
        """
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
            
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        
        total_stats = {
            "total_added": 0,
            "total_updated": 0,
            "dates_processed": 0,
            "dates_failed": 0,
            "dates_with_data": 0,
            "start_date": start_date,
            "end_date": end_date
        }
        
        current = start
        
        # Get fresh auth token first
        self.get_auth_token()
        await asyncio.sleep(API_CALL_DELAY)  # Wait after login before first data request
        
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            
            # Fetch data
            records = await self.fetch_benchmark_data(date_str)
            
            if records is None:
                # Failed after retries
                total_stats["dates_failed"] += 1
            elif records:
                # Has data - store it
                stats = await self.store_benchmark_data(date_str, records)
                total_stats["total_added"] += stats["added"]
                total_stats["total_updated"] += stats["updated"]
                total_stats["dates_processed"] += 1
                total_stats["dates_with_data"] += 1
            else:
                # No data for this date (weekend/holiday)
                total_stats["dates_processed"] += 1
                
            current += timedelta(days=1)
            
            # Rate limiting delay between API calls (non-blocking)
            if current <= end:
                await asyncio.sleep(API_CALL_DELAY)
                
        logger.info(f"Sync complete: {total_stats}")
        return total_stats
    
    async def sync_today(self) -> Dict:
        """Sync benchmark data for today"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        self.get_auth_token()
        await asyncio.sleep(API_CALL_DELAY)
        
        records = await self.fetch_benchmark_data(today)
        
        if records:
            return await self.store_benchmark_data(today, records)
        return {"added": 0, "updated": 0, "date": today, "status": "no_data"}


# Daily sync job function
async def run_daily_sync():
    """Run daily benchmark sync"""
    service = BenchmarkSyncService()
    try:
        await service.connect()
        result = await service.sync_today()
        logger.info(f"Daily sync result: {result}")
        return result
    finally:
        await service.close()


# Backfill function
async def run_backfill(start_date: str, end_date: str = None):
    """
    Run backfill for a date range.
    """
    service = BenchmarkSyncService()
    try:
        await service.connect()
        result = await service.sync_date_range(start_date, end_date)
        logger.info(f"Backfill result: {result}")
        return result
    finally:
        await service.close()


# CLI entry point
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python benchmark_sync_service.py daily          - Sync today's data")
        print("  python benchmark_sync_service.py backfill START_DATE [END_DATE]")
        print("  Example: python benchmark_sync_service.py backfill 2026-03-10")
        sys.exit(1)
        
    command = sys.argv[1]
    
    if command == "daily":
        asyncio.run(run_daily_sync())
    elif command == "backfill":
        start_date = sys.argv[2] if len(sys.argv) > 2 else "2026-03-10"
        end_date = sys.argv[3] if len(sys.argv) > 3 else None
        asyncio.run(run_backfill(start_date, end_date))
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
