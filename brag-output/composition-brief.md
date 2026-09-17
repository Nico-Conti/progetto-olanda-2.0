# Hyperframes Composition Brief: Progetto Olanda 2.0

## Objective
Create a short launch-style brag video for Progetto Olanda 2.0, with Kokoro narration.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.5s

## Source Material
- Project root: `/home/matte/progetto-olanda-2.0`
- Primary files read: `frontend/index.html`, `frontend/src/index.css`, `frontend/src/App.jsx`, `frontend/src/components/LandingPage.jsx`, `frontend/src/components/predictor/PredictionHero.jsx`, `frontend/src/components/HotMatches.jsx`, `frontend/src/components/MarketMoves.jsx`, `frontend/src/utils/statistics.js`, `README.md`
- Product name: Progetto Olanda 2.0
- Tagline / strongest claim: "Advanced football analytics."
- Key UI: real 2x screenshots of the running app (landing, nation/league picker, Eredivisie fixtures, Ajax vs Excelsior match page, Ajax team page) in `composition/assets/shots/`, framed with camera moves, cursor clicks and focus rings
- Copy that must appear verbatim:
  - Progetto Olanda 2.0
  - Advanced football analytics.
  - Select Your League
  - Predicted total Corners
  - Hot Matches / Best Matchups · Winning Factor / Bet Analysis · Market Moves / Closing Line Value
  - Powered by NickyBoy, Ciusbe, Baggianis, Giagulosky.

## Creative Direction
- Tone preset: cinematic
- Creative direction: Saturday-night football broadcast opener for a friends' betting lab
- Interpretation: big type, gold/emerald stadium light, confident reveals and dramatic wipes; warm, slightly wry narration so the credits land as the joke.
- Angle: treat a group of friends' stats app like a TV matchday intro — the model is serious, the crew is a group of friends.
- Hook: "GUT FEELING." struck through, replaced by "THE MODEL."
- Outro / punchline: VO says "Progetto Olanda" in Italian; logo + Silkscreen credits scramble (no highlight)
- Avoid: generic SaaS language, abstract filler, redesigning the app's look.

## Visual Identity
- Background: `#09090b` with radial glows `rgba(16,185,129,0.08)` / `rgba(139,92,246,0.08)`
- Text: `#f4f4f5`, muted `#a1a1aa`
- Accent: `#34d399` → `#22d3ee` (title), gold `#fbbf24`/`#fcd34d` (picker), hot `#fbbf24`→`#f97316`→`#ef4444` (total)
- Display font: Inter 900 (local file needed for lint); fallback system sans
- Body font: Inter; credits: Silkscreen
- Visual references: `frontend/public/logo.png`, glass panels `bg-zinc-900/60` with `border-white/10`, rounded-2xl cards

## Storyboard
Creative contract: `brag-output/brag-plan.md`.
1. Hook — 5.0s — GUT FEELING → THE MODEL
2. Real landing → nation → league — 4.2s — cursor clicks through the real picker, flag wipe
3. Real fixtures → Ajax vs Excelsior match page — 6.0s — zoom, click, 9.7 corners, probability ladder, click Ajax
4. Real Ajax team page — 4.3s — kit, stadium, season stats, next match, corners focus
5. Credits outro — 5.2s — logo, credits scramble

## Audio
- Audio role: cinematic support under narration
- Audio arc: bed fades in, ducks under voice, a hit on the hook, click on the picker, bell on the total, card sounds on features, bell on logo, fade out
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: ~0.3 bed, ducked to ~0.13 during narration, 1.5s fade-out
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (110 BPM). Strong cues 8.74s (total lands), 17.47s/18.56s (outro logo). Feature cards on every other beat.
- Audio-reactive treatment: subtle; RMS breathes the glow behind the total and the logo halo.
- Voiceover: Kokoro `af_heart`, script in `brag-plan.md`; scene lengths follow the WAV.
- SFX analysis guidance: `skills/brag/assets/sfx/sfx-analysis.md`; prefer low HF-risk files.
- Exact SFX choice: picked after animation exists; copied to `composition/assets/`.

## Hyperframes Instructions
Use hyperframes-core / animation / creative / keyframes / cli conventions. Show real UI, keep text readable, 15-25s, include music + SFX + voice, run `hyperframes check` before render.
