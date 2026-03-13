# SafeGuard SOS: Real-Time Women's Safety Network with Shake-Triggered Alerts, Live Tracking & Multi-Channel Coordination

## Problem Statement
In emergency situations, especially related to women's personal safety, victims often struggle to get timely help due to delays in communication, lack of real-time location sharing, and limited coordination between nearby people and authorities. Many existing safety applications only send alerts to a few pre-set contacts and do not provide a system that connects community members, nearby helpers, or response teams in a coordinated way. As a result, valuable time is lost during critical moments when immediate support could prevent harm.

## Solution: SafeGuard SOS
SafeGuard SOS is a full-stack, mobile-first emergency response platform designed to enable faster, more coordinated assistance during crises. It broadcasts real-time situation data to trusted contacts and provides a monitoring interface, dramatically reducing response time.

### Key Features
- **Shake-to-SOS Detection**: 3 quick shakes trigger emergency mode with a 5-second visible countdown and cancel option.
- **Automatic Audio Recording & Silent Mode**: Captures surroundings discreetly.
- **Real-Time GPS Location Streaming**: Updates every 30 seconds via WebSockets for live tracking.
- **Multi-Channel Alerts**: Instant SMS and WhatsApp notifications to emergency contacts using Twilio.
- **Live Web Tracking Dashboard** (`track.html`): Displays location trail, updates, and status for monitors/authorities.
- **Fake Incoming Call Screen**: Disguise feature for distraction in dangerous situations.
- **Direct Emergency Dialing**: One-tap calls to Indian emergency numbers (100 / 1091).
- **Offline Fallback & Mock Modes**: Works without internet; includes demo/testing modes for quick showcases.

## Tech Stack
- **Frontend/Mobile**: React Native (Expo) – Cross-platform app with shake detection and UI.
- **Backend**: Node.js + Express + Socket.io – Handles real-time location streaming and alerts.
- **Notifications**: Twilio API – SMS & WhatsApp integration.
- **Other**: WebSocket for live updates, Google Maps/Leaflet potential for dashboard, Expo sensors for shake/gps.

## Quick Setup & Run Instructions
1. **Clone the repo**:

   git clone https://github.com/HackIndiaXYZ/openclaw-hackathon-hackindia-sandhya.git

   cd openclaw-hackathon-hackindia-sandhya

3. **Backend** (adjust path if your structure differs):

   npm install

   node server.js    #or  npm start

5. **Mobile App** (Expo):

   npm install -g expo-cli   # if not installed

   cd frontend   # or your app folder

   expo start

Scan QR with Expo Go or run on emulator.

4. **Access Dashboard**: Open `track.html` in browser (update WebSocket URL to match your backend server if needed).

5. **Environment Variables**: Create `.env` with Twilio credentials (SID, Token, Phone) – **do NOT commit real keys!**

Full demo flow: Shake device → countdown → alerts sent → live location appears on dashboard → cancel confirms safety.
![Shake Detection Demo1](screenshots/shake-demo.png)
![Shake Detection Demo2](screenshots/shake-demo.png)
![Shake Detection Demo3](screenshots/shake-demo.png)
![Community](screenshots/dashboard.png)

## Demo Video
[Watch the 2-minute demo here](https://youtu.be/YOUR_VIDEO_ID_HERE)  

## Development Notes
- Core architecture, SOS trigger, location streaming, Twilio alerts, and dashboard built over the past month.
- Enhanced during OpenClaw Hackathon sprint: Real-time optimizations, UI polish, mock modes for judges, README/documentation, and quick-deploy setup.
- Project is fully functional as an MVP with real-world deployment potential.

## Impact & Scalability
- **Impact**: Empowers women and individuals in India by bridging the gap between victims, trusted contacts, community helpers, and authorities — potentially saving lives through seconds-faster response.
- **Scalability**: Mobile-first, uses cloud-friendly tech (Socket.io, Twilio), offline support, and extensible to community circles or AI threat detection.
- **Future Plans**: Add geo-fenced nearby helper notifications, basic ML for auto-emergency classification, blockchain for tamper-proof alert logs, production database (MongoDB/Firebase).

## License
MIT License (see LICENSE file)

Built for **OpenClaw Hackathon – HackIndia 2026**  
Team: Sandhya Chandel  
Contact: @SandhyaChandel5 on X

