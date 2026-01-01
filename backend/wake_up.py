import time
import requests
import os
import sys

# Configuration
BACKEND_URL = os.environ.get("BACKEND_URL")
if not BACKEND_URL:
    print("❌ Error: BACKEND_URL environment variable is not set.")
    sys.exit(1)

KEEP_ALIVE_URL = f"{BACKEND_URL}/keep-alive"
MAX_RETRIES = 5
INITIAL_WAIT_SECONDS = 30  # Wait time for first timeout/error
RETRY_DELAY_SECONDS = 10   # Wait time between subsequent retries

def wake_up():
    print(f"⏰ Waking up backend at: {KEEP_ALIVE_URL}")
    
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"🔸 Attempt {attempt}/{MAX_RETRIES}...")
            
            # Use a long timeout because cold starts take time (30-60s)
            response = requests.get(KEEP_ALIVE_URL, timeout=60)
            
            if response.status_code == 200:
                print("✅ Backend is awake and responding!")
                print(f"   Response: {response.json()}")
                return True
            elif response.status_code == 429:
                print("⚠️  Received 429 Too Many Requests.")
                print(f"   Render is likely starting up but overwhelmed. Cooling down for {RETRY_DELAY_SECONDS}s...")
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                print(f"⚠️  Unexpected status code: {response.status_code}")
                time.sleep(RETRY_DELAY_SECONDS)

        except requests.exceptions.Timeout:
            print("⏳ Request timed out (Server is likely cold booting).")
            # If it timed out, it means the server is trying to start. 
            # We wait a bit before checking again to avoiding hitting it instantly.
            print(f"   Waiting {RETRY_DELAY_SECONDS}s before checking status...")
            time.sleep(RETRY_DELAY_SECONDS)
            
        except requests.exceptions.ConnectionError:
            print("CONNECT ERROR: Server might be down or unreachable.")
            time.sleep(RETRY_DELAY_SECONDS)
            
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(RETRY_DELAY_SECONDS)

    print("❌ Failed to wake up backend after multiple attempts.")
    return False

if __name__ == "__main__":
    success = wake_up()
    if not success:
        sys.exit(1)
