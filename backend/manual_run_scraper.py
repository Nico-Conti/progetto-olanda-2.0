import logging
import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.scheduler import run_scraper_job

# Configure logging to see output clearly
logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    print("--- 🧪 Manual Trigger of Scheduler Job ---")
    print(" This will run the scraper exactly as the scheduler would.")
    print(" (Target: Eredivisie, Last Round Only, Skip Analysis)")
    print("----------------------------------------------------")
    
    run_scraper_job()
    
    print("----------------------------------------------------")
    print("✅ Manual Test Complete.")
