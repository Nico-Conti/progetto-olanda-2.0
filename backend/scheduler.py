import logging
import sys
from unittest.mock import patch
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from backend.scraper.main import main as scraper_main

logger = logging.getLogger(__name__)

def run_scraper_job():
    """
    Job that runs the scraper.
    Configured to run Eredivisie, Last Round Only, and Skip Analysis by default 
    to be lightweight for the automated schedule.
    """
    logger.info("🚀 Scheduler starting scraper job...")
    
    # Simulate command line arguments
    # We use "scraper" as the first arg (program name), then the rest
    test_args = ["scraper", "eredivisie", "--last-round", "--skip-analysis"]
    
    with patch.object(sys, 'argv', test_args):
        try:
            scraper_main()
            logger.info("✅ Scheduler job finished successfully.")
        except Exception as e:
            logger.error(f"❌ Scheduler job failed: {e}", exc_info=True)

def start_scheduler():
    """
    Starts the background scheduler.
    """
    scheduler = BackgroundScheduler()
    
    # Run every 6 hours
    trigger = IntervalTrigger(hours=6)
    
    scheduler.add_job(
        run_scraper_job,
        trigger=trigger,
        id="scraper_job",
        name="Scrape Eredivisie Last Round",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("⏰ Scheduler started. Job 'scraper_job' set to run every 6 hours.")
