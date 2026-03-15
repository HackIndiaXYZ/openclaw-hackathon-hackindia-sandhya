// ─── SafeGuard Backend — server.js ───────────────────────────────────────────
// Run: node server.js
// Install: npm install express socket.io cors twilio multer dotenv

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const twilio = require("twilio");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
fs.mkdirSync("uploads/audio", { recursive: true });

// ─── Twilio ───────────────────────────────────────────────────────────────────
const twilioClient =
  process.env.TWILIO_SID && process.env.TWILIO_TOKEN
    ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
    : null;

async function sendSMS(to, body) {
  if (!twilioClient) {
    console.log(`[SMS MOCK] → ${to}: ${body}`);
    return;
  }
  try {
    return await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_FROM,
      to,
    });
  } catch (e) {
    console.error("[SMS ERROR]", e.message);
  }
}
async function sendWhatsApp(to, body) {
  if (!twilioClient) {
    console.log(`[WA MOCK] → ${to}: ${body}`);
    return;
  }
  try {
    return await twilioClient.messages.create({
      body,
      from: `whatsapp:${process.env.TWILIO_FROM}`,
      to: `whatsapp:${to}`,
    });
  } catch (e) {
    console.error("[WA ERROR]", e.message);
  }
}

// ─── In-memory store ──────────────────────────────────────────────────────────
const activeSOS = new Map();
const locationHistory = new Map();

// ─── SOS Routes ───────────────────────────────────────────────────────────────
app.post("/api/sos/trigger", async (req, res) => {
  const { userId, userName, phone, lat, lng, contacts, shakeIntensity = 0, audioDuration = 0 } = req.body;
  if (!userId || !lat || !lng || !contacts?.length)
    return res.status(400).json({ error: "Missing required fields" });

  const sosId = `SOS_${userId}_${Date.now()}`;
  const baseUrl =
    process.env.BASE_URL ||
    `http://${getLocalIP()}:${process.env.PORT || 3001}`;
  const liveLink = `${baseUrl}/track.html?sosId=${sosId}`;

  // AI Alert Prioritization
  const { isBefore, isAfter, setHours, setMinutes } = require('date-fns');
  const now = new Date();
  const nightStart = setMinutes(setHours(now, 20), 0); // 8:00 PM
  const nightEnd = setMinutes(setHours(now, 6), 0); // 6:00 AM
  const nightTime = isAfter(now, nightStart) || isBefore(now, nightEnd);
  
  const score = (shakeIntensity * 0.4) + (audioDuration > 10 ? 0.3 : 0) + (nightTime ? 0.3 : 0);
  const priority = score > 0.7 ? "HIGH" : "NORMAL";

  // Mock Nearby Helpers
  const numHelpers = Math.floor(Math.random() * 2) + 2; // 2 or 3 helpers
  const helpersNotified = numHelpers;
  
  // Create mock helpers around the origin location (~1km radius)
  const helpers = Array.from({ length: numHelpers }).map((_, i) => {
    const latOffset = (Math.random() - 0.5) * 0.018; // roughly +/- 1km
    const lngOffset = (Math.random() - 0.5) * 0.018;
    return {
      id: `mock_helper_${i}`,
      lat: lat + latOffset,
      lng: lng + lngOffset,
      distance: Math.round(Math.random() * 800 + 200) // 200m to 1000m
    };
  });
  console.log(`[MOCK HELPERS] Notified ${numHelpers} nearby users within 1km.`, helpers);

  const alert = {
    sosId,
    userId,
    userName,
    phone,
    status: "ACTIVE",
    startedAt: new Date().toISOString(),
    location: { lat, lng },
    contacts,
    liveLink,
    audioFiles: [],
    priority,
    helpersNotified
  };
  activeSOS.set(userId, alert);
  locationHistory.set(userId, [{ lat, lng, ts: Date.now() }]);
  io.emit("sos:triggered", alert);

  let message =
    `🚨 EMERGENCY! ${userName} needs help!\n` +
    `📍 Live location: ${liveLink}\n` +
    `📞 Her number: ${phone}\n` +
    `⏰ ${new Date().toLocaleTimeString("en-IN")}`;
    
  if (priority === "HIGH") {
    message = `⚠️ HIGH PRIORITY SOS ⚠️\n` + message;
  }

  await Promise.allSettled([
    ...contacts.map((c) => sendSMS(c.phone, message)),
    ...contacts.map((c) => sendWhatsApp(c.phone, message)),
  ]);
  console.log(`[SOS TRIGGERED] ${userName} — ${sosId} | Priority: ${priority}`);
  res.json({ success: true, sosId, liveLink, priority, helpersNotified });
});

app.post("/api/sos/location", (req, res) => {
  const { userId, lat, lng } = req.body;
  const alert = activeSOS.get(userId);
  if (!alert) return res.status(404).json({ error: "No active SOS" });
  alert.location = { lat, lng };
  const hist = locationHistory.get(userId) || [];
  if (hist.length >= 100) hist.shift();
  hist.push({ lat, lng, ts: Date.now() });
  locationHistory.set(userId, hist);
  io.emit("sos:location_update", {
    sosId: alert.sosId,
    userId,
    lat,
    lng,
    ts: Date.now(),
  });
  res.json({ success: true });
});

app.post("/api/sos/cancel", async (req, res) => {
  const { userId } = req.body;
  const alert = activeSOS.get(userId);
  if (!alert) return res.status(404).json({ error: "No active SOS" });
  alert.status = "CANCELLED";
  activeSOS.delete(userId);
  io.emit("sos:cancelled", { sosId: alert.sosId, userId });
  await Promise.allSettled(
    alert.contacts.map((c) =>
      sendSMS(c.phone, `✅ ${alert.userName} is safe. SOS cancelled.`),
    ),
  );
  console.log(`[SOS CANCELLED] ${alert.userName}`);
  res.json({ success: true });
});

app.get("/api/sos/track/:sosId", (req, res) => {
  for (const [, alert] of activeSOS) {
    if (alert.sosId === req.params.sosId) {
      return res.json({
        active: true,
        userName: alert.userName,
        liveLink: alert.liveLink,
        location: alert.location,
        startedAt: alert.startedAt,
        history: (locationHistory.get(alert.userId) || []).slice(-20),
      });
    }
  }
  res.json({ active: false, message: "SOS resolved or not found" });
});

const upload = multer({
  dest: "uploads/audio/",
  limits: { fileSize: 50 * 1024 * 1024 },
});
app.post("/api/sos/audio", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const alert = activeSOS.get(req.body.userId);
  if (alert)
    alert.audioFiles.push({
      filename: req.file.filename,
      ts: new Date().toISOString(),
    });
  res.json({ success: true, filename: req.file.filename });
});

app.get("/api/sos/active", (req, res) =>
  res.json({ count: activeSOS.size, alerts: Array.from(activeSOS.values()) }),
);

// ─── Safety Map + Circle Routes ───────────────────────────────────────────────
const safetyRoutes = require("./routes/safety");
app.use("/api/safety", safetyRoutes);

const circleRoutes = require("./routes/circle");
circleRoutes.setIO(io);
app.use("/api/circle", circleRoutes);

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  socket.on("track:subscribe", ({ sosId }) => socket.join(`track:${sosId}`));

  socket.on("join", ({ circleId, userId }) => {
    socket.join(circleId);
    console.log(`[CIRCLE] ${userId} joined room ${circleId}`);
  });

  socket.on("location:update", ({ userId, lat, lng, circleId }) => {
    if (circleId)
      socket.to(circleId).emit("member:location", { userId, lat, lng });
  });

  socket.on("disconnect", () => console.log(`[WS] Disconnected: ${socket.id}`));
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    activeSOS: activeSOS.size,
    twilio: twilioClient ? "live" : "mock",
  }),
);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ─── Start ────────────────────────────────────────────────────────────────────
function getLocalIP() {
  const nets = require("os").networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === "IPv4" && !net.internal) return net.address;
  return "localhost";
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`
╔══════════════════════════════════════════════════╗
║        🛡  SafeGuard Backend Running             ║
╠══════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                 ║
║  Network: http://${ip}:${PORT}                ║
║  Twilio:  ${twilioClient ? "✅ LIVE — SMS will send" : "⚠️  MOCK — SMS logged only"}    ║
╠══════════════════════════════════════════════════╣
║  http://${ip}:${PORT}/track.html              ║
║  http://${ip}:${PORT}/map.html                ║
║  http://${ip}:${PORT}/circle.html             ║
║  http://${ip}:${PORT}/admin.html              ║
╚══════════════════════════════════════════════════╝

  👉 Set in App.js:  API_URL = "http://${ip}:${PORT}"
`);
});
