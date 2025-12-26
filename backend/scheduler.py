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
    Args:
        --last-round: Only scrape the latest matchday.
        --skip-analysis: Don't use Gemini (saving costs/time for weekly updates).
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
                # Strip newline to avoid double spacing with logger
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
        
        # Small pause between leagues to be nice
        time.sleep(5)

def start_scheduler():
    scheduler = BackgroundScheduler()
    
    # Run every Sunday, Monday, Tuesday at 03:00 AM (Night)
    # Covers late Sunday games and Monday night games.
    scheduler.add_job(
        run_scraper_job,
        trigger=CronTrigger(day_of_week='sun,mon,tue', hour=3, minute=0),
        id='scraper_weekly_update',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("📅 Scheduler started. Next run: Monday at 03:00 AM.")
    
    try:
        # Keep main thread alive if run directly
        while True:
            time.sleep(2)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()

if __name__ == "__main__":
    start_scheduler()
