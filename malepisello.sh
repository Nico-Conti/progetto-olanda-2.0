#!/bin/bash

# Start docker services in the background
echo "Starting Docker containers..."
docker compose up -d

# Navigate to frontend and start dev server
echo "Starting Frontend development server..."
cd frontend || exit
npm run dev
