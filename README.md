# techFest

Women's development project for secure root

# 🚨 SafeGuard SOS — TachFest26

### Women's Safety Emergency Alert System

A full-stack SOS system: **React Native app → Node.js backend → Live tracking web UI**

---

## Why SafeGuard?
> **According to the NCRB 2024 Report, there were ~4.45 lakh reported crimes against women in India.**
> Faster emergency response and real-time verifiable alerts can save lives. SafeGuard SOS reduces response times by directly routing alerts to mock "Nearby Helpers" and assigning "High Priority" AI-based scoring to severe events.

---

## 📸 Screenshots

| SOS Trigger Screen (Countdown) | Live Tracking Dashboard (Web) | Fake Call (Deescalation) |
| :----------------------------: | :---------------------------: | :----------------------: |
| ![SOS Screen](docs/placeholder1.png) | ![Dashboard](docs/placeholder2.png) | ![Fake Call](docs/placeholder3.png) |

*(Note: Create a `docs` folder and replace with actual screenshots before submission!)*

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MOBILE APP (Expo)                   │
│  Shake 3× → SOS triggered → Audio recording starts  │
│  Location streams every 30s via REST                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼──────────────────────────────┐
│              BACKEND (Node.js + Socket.io)           │
│  POST /api/sos/trigger  → SMS + WhatsApp via Twilio  │
│  POST /api/sos/location → broadcasts to trackers     │
│  GET  /api/sos/track/:id → public tracking page      │
└──────────────────────┬──────────────────────────────┘
                       │ Real-time WebSocket
┌──────────────────────▼──────────────────────────────┐
│           TRACKING PAGE (track.html)                 │
│  Emergency contacts open link → see live location    │
│  Location trail, quick-call buttons, share link      │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start (Hackathon Mode — 20 mins)

### 1. Backend

```bash
cd techFest
npm install
cp .env.example .env
# Edit .env — leave Twilio fields blank for MOCK mode (no real SMS)
node server.js
```

Backend runs at `http://localhost:3001`
Mock mode logs SMS to the console instead of sending real messages.

### 2. Mobile App

```bash
cd techFest/sos-app
# (Ensure you are in the sos-app directory)
npm install
npx expo start
```

- Scan QR with Expo Go app (iOS/Android)
- Edit `App.js` line 21: set `API_URL` to your machine's local IP
  ```js
  const API_URL = "http://192.168.x.x:3001"; // your LAN IP
  ```
- Edit `USER` and `EMERGENCY_CONTACTS` constants with real data

### 3. Live Tracking Page

Open `techFest/public/track.html` in a browser, or serve it:

```bash
# Backend already serves it at:
http://localhost:3001/track/DEMO_SOS
```

---

## SOS Flow (End to End)

```
1. User shakes phone 3 times
2. 5-second countdown appears (tap to cancel)
3. If not cancelled:
   ├── Audio recording starts
   ├── POST /api/sos/trigger (lat, lng, contacts)
   │   ├── SMS sent: "EMERGENCY! Priya needs help! Link: ..."
   │   └── WhatsApp sent to all contacts
   ├── Location updates every 30s → POST /api/sos/location
   └── WebSocket broadcasts → tracking page updates in real time
4. Contact opens link → sees live location trail
5. User reaches safety → taps CANCEL
   ├── POST /api/sos/cancel
   ├── SMS: "Priya is safe now"
   └── Tracking page shows resolved
```

---

## Feature Checklist

| Feature                | Status | File                    |
| ---------------------- | ------ | ----------------------- |
| SOS button (tap)       | ✅     | App.js                  |
| Shake detection (3×)   | ✅     | App.js                  |
| 5s countdown + cancel  | ✅     | App.js                  |
| SMS alert (Twilio)     | ✅     | server.js               |
| WhatsApp alert         | ✅     | server.js               |
| Live location stream   | ✅     | App.js + server.js      |
| Audio recording        | ✅     | App.js                  |
| Fake call screen       | ✅     | App.js                  |
| Call 100 / 1091        | ✅     | App.js                  |
| Live tracking web UI   | ✅     | track.html              |
| WebSocket real-time    | ✅     | server.js + track.html  |
| Location trail log     | ✅     | track.html              |
| Silent mode (no alarm) | ✅     | shake trigger is silent |
| Offline SMS fallback   | ✅     | App.js fallbackSMS()    |
| AI Priority Alerts     | ✅     | server.js / track.html  |
| Nearby Helpers Mock    | ✅     | server.js / track.html  |

---

## Twilio Setup (for real SMS — 5 min)

1. Create free account at [twilio.com](https://twilio.com)
2. Get a trial number (works for hackathon demos)
3. Add to `.env`:
   ```
   TWILIO_SID=ACxxxxxxxxxx
   TWILIO_TOKEN=your_token
   TWILIO_FROM=+1415xxxxxxx
   ```
4. For WhatsApp: enable sandbox at `console.twilio.com → Messaging → WhatsApp`

---

## Demo Script (for judges)

1. **Show the app** — point out SOS button, explain shake trigger
2. **Open tracking page** in browser (show on laptop screen)
3. **Trigger SOS** from phone → watch SMS log in terminal + page update. Highlight "Helpers Notified" and "High Priority" features.
4. **Show location trail** updating in real time
5. **Demo fake call** — "Mom" calling with ringing mock
6. **Cancel SOS** → show "safe" confirmation

---

## Future Plans (Day 2+ Extensions)

- **Blockchain Logging**: Log incident hashes to Polygon testnet for verifiable public records (`IncidentRegistry.sol`).
- **Real Helper Dispatch**: Instead of mocking helpers, query nearby active user nodes and dispatch push notifications via React Native Firebase.
- **Advanced Audio Analysis**: Use onboard AI model to classify screams or crashes to auto-trigger SOS without shaking.

---

## Stack

- **Mobile**: React Native + Expo
- **Backend**: Node.js + Express + Socket.io
- **SMS/WhatsApp**: Twilio
- **Maps**: Google Maps JS API (key needed) / OpenStreetMap fallback
- **Blockchain (future plan)**: Polygon + Solidity + ethers.js
