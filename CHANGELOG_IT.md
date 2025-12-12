# 📝 Changelog - Progetto Olanda 2.0 (Branch Advanced Stats)

Questo documento riassume tutte le modifiche e le nuove funzionalità implementate in questo branch.

## 🧠 Backend & Data Science

### 1. Nuove Metriche Avanzate
Abbiamo aggiornato il database e lo scraper per raccogliere dati di livello professionistico:
-   **xG (Expected Goals)**: Qualità delle occasioni create.
-   **xGOT (Expected Goals on Target)**: Pericolosità dei tiri nello specchio.
-   **Big Chances**: Grandi occasioni da gol.
-   **Box Touches**: Tocchi in area avversaria (fondamentale per i corner).
-   **Cross**: Numero di cross tentati.

### 2. Nuovi Modelli di Previsione
Abbiamo sostituito le vecchie logiche euristiche con veri modelli statistici:
-   **Corner Regression Model**: Un modello di regressione lineare addestrato su ~500 partite. Usa *Box Touches* e *Tiri* per prevedere i corner basandosi sulla forma recente.
-   **Modello Ibrido**: Combina la stabilità della media storica (40%) con la reattività del modello di regressione (60%).
-   **Goal Prediction ("High Octane")**: Modello che prevede i gol totali basandosi principalmente sugli *xGOT* (correlazione del 71%).
-   **Poisson Match Winner**: Calcola le probabilità percentuali (1X2) simulando la partita con la distribuzione di Poisson basata sugli xG.

### 3. API Endpoints
-   `GET /predict/corners/{home}/{away}?model=hybrid`: Restituisce la previsione corner con possibilità di scegliere il modello.
-   `GET /predict/goals/{home}/{away}`: Restituisce la previsione gol e le probabilità di vittoria.

---

## 🖥️ Frontend (Interfaccia Utente)

### 1. Pagina Info & Models
-   Creata una nuova sezione **"Info & Models"** accessibile dalla barra di navigazione.
-   Spiega in modo chiaro e visivo come funzionano i tre modelli (Storico, Regressione, Ibrido).

### 2. Selettore Modello
-   Aggiunto un menu a tendina nel **"Custom Matchup"** che permette all'utente di scegliere quale algoritmo usare per la previsione corner:
    -   *Hybrid (Consigliato)*
    -   *Regression (Solo Forma Recente)*
    -   *Historical (Solo Media Stagionale)*

*(Nota: Le schede grafiche per Gol e Vincitore sono pronte nel backend ma attualmente nascoste nel frontend per mantenere l'interfaccia pulita, come richiesto).*

---

