# 🇳🇱 Progetto Olanda 2.0

**The Ultimate Eredivisie Prediction Engine.**

![Project Banner](https://img.shields.io/badge/Status-Active-success) ![Version](https://img.shields.io/badge/Version-2.0-blue) ![League](https://img.shields.io/badge/League-Eredivisie-orange)

## 🚀 Introduction

**Progetto Olanda 2.0** is a state-of-the-art football analytics platform designed to predict match outcomes in the Dutch Eredivisie with high precision. Unlike standard predictors that rely solely on historical averages, this system uses **Advanced Metrics** (xG, xGOT, Box Touches) and **Machine Learning Regression** to analyze team form and "pressure".

## ✨ Key Features

-   **🎯 Advanced Corner Predictor**:
    -   **Hybrid Model**: Combines historical data with recent form regression.
    -   **Pressure Analysis**: Uses "Box Touches" and "Shots" to gauge attacking intensity.
-   **⚽ Goal & Winner Models**:
    -   **"High Octane" Goal Model**: Predicts total goals using xGOT (Expected Goals on Target).
    -   **Poisson Match Winner**: Calculates precise 1X2 probabilities.
-   **📊 Modern Dashboard**:
    -   Beautiful "Glassmorphism" UI.
    -   Interactive charts and stats visualization.
    -   Custom Matchup Analysis.

## 📚 Documentation

For a deep dive into the architecture, database schema, and the mathematics behind our prediction models, please refer to the **Technical Documentation**:

👉 **[READ THE TECHNICAL DOCS (TECHNICAL_DOCS.md)](TECHNICAL_DOCS.md)** 👈

## 🛠️ Quick Start

### Prerequisites
-   Python 3.10+
-   Node.js 16+
-   Supabase Account

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---
*Developed by [Your Name] for Progetto Olanda.*
