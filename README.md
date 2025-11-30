# Progetto Olanda 2.0

Welcome to the new and improved Progetto Olanda! This version is split into a Python backend (for scraping and AI analysis) and a React frontend (for a slick UI).

## Where we are at
This is currently a **test setup** to make sure everything connects properly.
- **Backend**: Handles the heavy lifting (scraping data, talking to Supabase, and running Gemini analysis).
- **Frontend**: Displays the stats, trends, and predictions in a nice dark-mode interface.

## How to Run It

### 1. Fire up the Backend
Open a terminal in the main folder (`progetto-olanda/`) and run:
```bash
sudo docker-compose up -d --build
```
This starts the API server on `http://localhost:8000`.

### 2. Start the Frontend
Open a new terminal, go to the frontend folder, and start the dev server:
```bash
cd frontend
npm run dev
```
This will launch the app on `http://localhost:5173`.

## What to Look For
Open the app in your browser. If you see a green **"Backend Online"** badge in the top header, you're good to go!

## Features Ready to Test
- **League Trends**: Check out the "Trends" tab to see how teams are performing (Season vs Last 3/5/10 games).
- **Predictor**: Go to the "Predictor" tab to see AI-powered match predictions.
- **Scraper**: You can manually run the scraper to fetch new data (see `backend/scraper.py`).

Enjoy! 🚀
