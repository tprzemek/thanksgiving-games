# 🦃 Thanksgiving AI Game Night

Six fast, multi-generational interactive AI games for kids and adults — playable on **one phone** (pass-and-play) OR across **everyone's phones via scannable QR code**!

## The 6 Included Games

1. **🔍 Prompt Clone! (Reverse-Prompt Challenge)** — Everyone studies the same AI-generated image and gets 1–3 minutes to write an AI prompt to recreate it as closely as possible. The AI then regenerates each participant's image side-by-side and grades every submission on visual & detail resemblance (0–100%)!
2. **⚖️ Turkey Court** — Two players argue a hilarious Thanksgiving case while the AI Judge slams a live mid-speech **OBJECTION! Plot Twist** and scores Creativity, Logic, and Recovery.
3. **🎨 Prompt Panic!** — One artist gets 25 seconds to prompt the AI from a wacky secret phrase; everyone else races to buzz in as the artwork slowly unblurs.
4. **💣 Pass the Gobble Bomb** — Hot-potato AI story passed around the table with an accelerating hidden fuse, mandatory twist words, surprise modifiers, and an AI-illustrated storybook finale.
5. **🤖 Spot the Bot: Dinner Table Edition** — Everyone submits a secret witty answer, the AI slips in convincing fake answers, and everyone races to slam **"THAT'S A BOT!"**.
6. **🏆 Feast Showdown** — Age-balanced family game show with **Kid / Teen / Adult** scaled Lightning Buzz trivia, absurd fusion-dish Pitch Battles, and 5-second Rapid-Fire Chains.

## Ways to Play

### 1. Live Multi-Phone Play via Hosted URL (GitHub Pages / Netlify)
Host `index.html` on any static HTTPS host (like GitHub Pages). Open it on the Host screen (TV/laptop/tablet/phone), tap **📱 QR**, and have everyone scan the QR code to join on their own phone — works over Wi-Fi or cellular 5G!

### 2. Instant Home Wi-Fi Party Server (Zero Internet Needed)
```bash
node server.js
```
Open the printed URL on the Host laptop/tablet, tap **📱 QR**, and every phone on the same Wi-Fi scans to join with instant local LAN sync.

### 3. Single-Phone Pass-and-Play
Open `index.html` directly on one phone or tablet — every game includes pass-the-phone privacy entry and split-screen multiplayer buzzers!

## Optional AI Upgrades (Settings ⚙️)
All 6 games work **100% out of the box with no API keys** (built-in instant AI engine, voice host, Web Audio sound FX, and procedural Canvas AI Artist). Open **⚙️ Settings** anytime to optionally enable:
- **Live Photorealistic AI Images** (Pollinations.ai free instant generation)
- **Google Gemini (`gemini-2.0-flash`)** or **OpenAI (`gpt-4o-mini`)** for custom LLM judging and bespoke bot answers.
