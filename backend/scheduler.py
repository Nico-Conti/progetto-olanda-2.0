from datetime import datetime
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import time
import subprocess
import sys
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_scraper_job():
    """
    Runs the scraper as a subprocess to ensure clean memory usage.
    Iterates through all supported leagues.
    """
    logger.info("🚀 Starting Scheduled Scraper Job...")
    
    leagues = ["eredivisie", "laliga", "serieb", "seriea", "bundesliga", "ligue1", "premier"]
    
    for league in leagues:
        logger.info(f"🔄 Starting scrape for league: {league.upper()}...")
        
        # Command to run: python3 -u -m backend.scraper.main <league> --last-round --skip-analysis
        cmd = [
            sys.executable, "-u", "-m", "backend.scraper.main",
            league,
            "--last-round",
            "--skip-analysis"
        ]
        
        try:
            # Run subprocess and stream output line by line
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Merge stderr into stdout
                text=True,
                bufsize=1 # Line buffered
            )

            # Iterate over output as it appears
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.info(f"[Scraper-{league}] {line}")
            
            # Wait for finish
            return_code = process.wait()
            
            if return_code == 0:
                logger.info(f"✅ Scraper finished successfully for {league}.")
            else:
                logger.error(f"❌ Scraper Job Failed for {league}! Exit Code: {return_code}")

        except Exception as e:
            logger.error(f"❌ Unexpected error in scheduler job for {league}: {e}")
        
        # Small pause between leagues
        time.sleep(5)

def start_scheduler():
    scheduler = BackgroundScheduler()
    
    # Run every day at 00:00 AM (Midnight)
    # Covers games from all days.
    # Timezone: Defaults to server time (UTC on Render)
    scheduler.add_job(
        run_scraper_job,
        trigger=CronTrigger(day_of_week='mon,tue,wed,thu,fri,sat,sun', hour=0, minute=0),
        id='scraper_weekly_update',
        replace_existing=True,
        misfire_grace_time=3600 # Allow job to run if server wakes up up to 1 hour late
    )
    
    scheduler.start()
    logger.info("📅 Scheduler started. Next run: Daily at 00:00 AM.")
    

if __name__ == "__main__":
    start_scheduler()
    try:
        # Keep main thread alive if run directly
        while True:
            time.sleep(2)
    except (KeyboardInterrupt, SystemExit):
        pass
