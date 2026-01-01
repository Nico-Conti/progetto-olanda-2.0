from datetime import datetime
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import time
import subprocess
import sys
import os
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from backend.status import update_status

def run_scraper_job(target_league=None):
    """
    Runs the scraper as a subprocess to ensure clean memory usage.
    Iterates through all supported leagues or a specific one.
    """
    logger.info("🚀 Starting Scheduled Scraper Job...")
    update_status(is_running=True, message="Starting Scraper Job...", progress=0)
    
    if target_league:
        leagues = [target_league]
    else:
        leagues = ["eredivisie", "laliga", "serieb", "seriea", "bundesliga", "ligue1", "premier"]
    
    total_leagues = len(leagues)
    
    for i, league in enumerate(leagues):
        overall_prog = int((i / total_leagues) * 100)
        logger.info(f"🔄 Starting scrape for league: {league.upper()} ({i+1}/{total_leagues})...")
        update_status(message=f"Starting scraping for {league.upper()}...", progress=0, overall_progress=overall_prog)
        
        # Command to run: python3 -u -m backend.scraper.main <league> --skip-analysis
        # Removed --last-round to ensure we catch old postponed games
        cmd = [
            sys.executable, "-u", "-m", "backend.scraper.main",
            league,
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
            total_matches = 0
            current_msg = f"Starting {league.upper()}..."
            current_prog = 0
            
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.info(f"[Scraper-{league}] {line}")
                    
                    should_update = False

                    # Regex parsing for meaningful progress
                    
                    # 1. "Found 10 matches"
                    m_found = re.search(r"Found (\d+) matches", line)
                    if m_found:
                        total_matches = int(m_found.group(1))
                        current_msg = league.upper() # User requested just [LEAGUE]
                        current_prog = 5
                        should_update = True

                    # 2. "Match 1/10"
                    m_step = re.search(r"Match (\d+)/(\d+)", line)
                    if m_step and total_matches > 0:
                        current = int(m_step.group(1))
                        # Scale scraping to 5-90%
                        current_prog = int((current / total_matches) * 85) + 5
                        current_msg = league.upper() # User requested just [LEAGUE]
                        should_update = True

                    # 3. "STEP 3: Syncing"
                    if "STEP 3: Syncing" in line:
                        current_msg = league.upper() # User requested just [LEAGUE]
                        current_prog = 95
                        should_update = True
                        
                    # 4. "Saved N matches" (Scraping done)
                    if "Saved" in line and "matches to" in line:
                         current_msg = league.upper() # User requested just [LEAGUE]
                         current_prog = 90
                         should_update = True

                    if should_update:
                        update_status(message=current_msg, progress=current_prog, overall_progress=overall_prog)
            
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

    # After detailed scraping, run the Fixture/Date Updater
    logger.info("📅 Starting Fixture & Date Update (Scraping Calendars)...")
    update_status(message="Updating match dates & fixtures...", progress=98, overall_progress=98)
    
    try:
        # fixtures_scraper can take a league arg, but if we are running 'all', we can run it once for all 
        # OR run it per league. Efficiency-wise, running it per league inside the loop might be better?
        # But fixtures_scraper logic is 'all leagues' if no arg?
        # Let's run it once at the end for ALL leagues if target_league is None, 
        # or for the specific league if target_league is set.
        
        fix_cmd = [sys.executable, "-u", "-m", "backend.secondary_scrapers.fixtures_scraper"]
        if target_league:
             fix_cmd.append(target_league)
             
        fix_process = subprocess.run(fix_cmd, capture_output=True, text=True)
        if fix_process.returncode == 0:
             logger.info("✅ Fixture update completed successfully.")
             # logger.info(fix_process.stdout)
        else:
             logger.error(f"❌ Fixture update failed: {fix_process.stderr}")
             
    except Exception as e:
         logger.error(f"❌ Error running fixture updater: {e}")

    update_status(is_running=False, message="Scraper finished.", progress=100, overall_progress=100)

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
