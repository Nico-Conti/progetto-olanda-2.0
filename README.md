# Progetto Olanda 2.0 - Connection Test

This branch is set up to **test the connection** between the new Python Backend and the React Frontend.

## 🧪 Purpose
We have split the project into two parts to improve scalability:
- **Backend**: FastAPI server (Python) running in Docker.
- **Frontend**: React application (Vite).

Currently, this is a **test setup** to verify that the Frontend can talk to the Backend.
If successful, you will see a **"Backend Online"** badge in the application header.

## 🚀 How to Run

### 1. Start the Backend
From the project root (`progetto-olanda/`):
```bash
sudo docker-compose up -d --build
```
*This starts the API server on `http://localhost:8000`.*

### 2. Start the Frontend
Open a new terminal, go to the frontend folder, and run:
```bash
cd frontend
npm install  # (Only needed the first time)
npm run dev
```
*This starts the UI on `http://localhost:5173`.*

## ✅ Verification
1. Open the App in your browser.
2. Look for the **Backend Online** badge in the top header.
