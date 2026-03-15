// routes/circle.js
// Add to server.js: app.use('/api/circle', require('./routes/circle'))
// This module handles Safety Circle membership, proximity detection, and SOS propagation

const express = require('express');
const router  = express.Router();

// ─── In-memory store (swap PostgreSQL + Redis in prod) ────────────────────────
// members[userId] = { userId, name, phone, lat, lng, lastSeen, circles[], status, rating }
const members = new Map();

// circles[circleId] = { id, name, area, memberIds[], createdBy, createdAt }
const circles = new Map();

// activeAlerts[alertId] = { alertId, userId, userName, lat, lng, ts, responses[], status }
const activeAlerts = new Map();

// Seed demo Safety Circle — "Koramangala Women's Circle"
const DEMO_CIRCLE_ID = 'circle_korm_001';
circles.set(DEMO_CIRCLE_ID, {
  id: DEMO_CIRCLE_ID,
  name: "Koramangala Women's Circle",
  area: 'Koramangala, Bangalore',
  memberIds: ['m1','m2','m3','m4','m5','m6','m7','m8'],
  createdBy: 'm1',
  createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
});

// Seed demo members (spread around Koramangala)
const DEMO_MEMBERS = [
  { userId:'m1', name:'Priya S.',    phone:'+919876543210', lat:12.9352, lng:77.6245, status:'online',  rating:4.9, respondedCount:12, circles:[DEMO_CIRCLE_ID] },
  { userId:'m2', name:'Anjali R.',   phone:'+919876543211', lat:12.9361, lng:77.6252, status:'online',  rating:4.8, respondedCount:8,  circles:[DEMO_CIRCLE_ID] },
  { userId:'m3', name:'Sneha K.',    phone:'+919876543212', lat:12.9340, lng:77.6230, status:'online',  rating:5.0, respondedCount:15, circles:[DEMO_CIRCLE_ID] },
  { userId:'m4', name:'Divya M.',    phone:'+919876543213', lat:12.9370, lng:77.6260, status:'away',    rating:4.7, respondedCount:6,  circles:[DEMO_CIRCLE_ID] },
  { userId:'m5', name:'Kavya T.',    phone:'+919876543214', lat:12.9330, lng:77.6270, status:'online',  rating:4.9, respondedCount:20, circles:[DEMO_CIRCLE_ID] },
  { userId:'m6', name:'Meera P.',    phone:'+919876543215', lat:12.9380, lng:77.6210, status:'offline', rating:4.6, respondedCount:4,  circles:[DEMO_CIRCLE_ID] },
  { userId:'m7', name:'Riya B.',     phone:'+919876543216', lat:12.9345, lng:77.6280, status:'online',  rating:4.8, respondedCount:9,  circles:[DEMO_CIRCLE_ID] },
  { userId:'m8', name:'Pooja N.',    phone:'+919876543217', lat:12.9360, lng:77.6220, status:'online',  rating:5.0, respondedCount:18, circles:[DEMO_CIRCLE_ID] },
];
DEMO_MEMBERS.forEach(m => members.set(m.userId, { ...m, lastSeen: new Date().toISOString() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function getMembersNear(lat, lng, radiusKm, excludeUserId) {
  return Array.from(members.values()).filter(m =>
    m.userId !== excludeUserId &&
    m.status !== 'offline' &&
    haversineKm(lat, lng, m.lat, m.lng) <= radiusKm
  ).map(m => ({
    ...m,
    distanceKm: parseFloat(haversineKm(lat, lng, m.lat, m.lng).toFixed(2)),
    estimatedMinutes: Math.round(haversineKm(lat, lng, m.lat, m.lng) / 5 * 60), // ~5km/h walking
  })).sort((a,b) => a.distanceKm - b.distanceKm);
}

// Get io instance (set by server.js)
let _io = null;
router.setIO = (io) => { _io = io; };

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/circle/members/near?lat=&lng=&radius=2
// Find circle members near a location
router.get('/members/near', (req, res) => {
  const { lat, lng, radius = 2, excludeUser } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const nearby = getMembersNear(parseFloat(lat), parseFloat(lng), parseFloat(radius), excludeUser);
  res.json({ count: nearby.length, members: nearby, radiusKm: parseFloat(radius) });
});

// GET /api/circle/:circleId
// Get circle details + members
router.get('/:circleId', (req, res) => {
  const circle = circles.get(req.params.circleId);
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  const circleMembers = circle.memberIds
    .map(id => members.get(id))
    .filter(Boolean)
    .map(m => ({
      ...m,
      phone: undefined, // don't expose phone in list
    }));

  res.json({ circle, members: circleMembers, totalMembers: circleMembers.length });
});

// POST /api/circle/join
// Join a safety circle
router.post('/join', (req, res) => {
  const { userId, name, phone, lat, lng, circleId } = req.body;
  if (!userId || !name || !circleId) return res.status(400).json({ error: 'Missing fields' });

  const existing = members.get(userId) || {
    userId, name, phone, lat: parseFloat(lat), lng: parseFloat(lng),
    status: 'online', rating: 5.0, respondedCount: 0,
    circles: [], lastSeen: new Date().toISOString(),
  };

  if (!existing.circles.includes(circleId)) existing.circles.push(circleId);
  members.set(userId, existing);

  const circle = circles.get(circleId);
  if (circle && !circle.memberIds.includes(userId)) {
    circle.memberIds.push(userId);
    circles.set(circleId, circle);
  }

  // Broadcast new member to circle
  if (_io) _io.to(circleId).emit('circle:member_joined', { userId, name, circleId });

  res.json({ success: true, member: existing, circle });
});

// POST /api/circle/sos/broadcast
// CORE: SOS triggered → find nearby members → alert them all
// Body: { userId, userName, lat, lng, message?, circleIds? }
router.post('/sos/broadcast', (req, res) => {
  const { userId, userName, lat, lng, message, circleIds } = req.body;
  if (!userId || !lat || !lng) return res.status(400).json({ error: 'Missing fields' });

  const alertId = `CALERT_${userId}_${Date.now()}`;
  const ALERT_RADIUS_KM = 2; // notify members within 2km

  // Find nearby members across all circles this user belongs to
  const nearbyMembers = getMembersNear(parseFloat(lat), parseFloat(lng), ALERT_RADIUS_KM, userId);

  // Also notify all members of user's circles regardless of distance (they can choose to help)
  const userObj = members.get(userId);
  const userCircleIds = userObj?.circles || circleIds || [DEMO_CIRCLE_ID];
  const circleMembers = new Map();
  userCircleIds.forEach(cid => {
    const circle = circles.get(cid);
    if (circle) {
      circle.memberIds.forEach(mid => {
        if (mid !== userId) {
          const m = members.get(mid);
          if (m && m.status !== 'offline') circleMembers.set(mid, m);
        }
      });
    }
  });

  // Merge: nearby first, then rest of circle
  const alertRecipients = new Map();
  nearbyMembers.forEach(m => alertRecipients.set(m.userId, { ...m, isNearby: true }));
  circleMembers.forEach((m, id) => {
    if (!alertRecipients.has(id)) {
      const distKm = haversineKm(lat, lng, m.lat, m.lng);
      alertRecipients.set(id, {
        ...m,
        isNearby: false,
        distanceKm: parseFloat(distKm.toFixed(2)),
        estimatedMinutes: Math.round(distKm / 5 * 60),
      });
    }
  });

  const alert = {
    alertId,
    userId,
    userName,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    message: message || `${userName} needs help!`,
    mapsLink: `https://maps.google.com/?q=${lat},${lng}`,
    ts: new Date().toISOString(),
    status: 'ACTIVE',
    responses: [],
    notifiedCount: alertRecipients.size,
    nearbyCount: nearbyMembers.length,
  };
  activeAlerts.set(alertId, alert);

  // Broadcast to all connected circle members via WebSocket
  const alertPayload = {
    ...alert,
    recipients: Array.from(alertRecipients.values()),
  };

  if (_io) {
    // Emit to every circle room the user belongs to
    userCircleIds.forEach(cid => _io.to(cid).emit('circle:sos_alert', alertPayload));
    // Also emit globally for demo dashboard
    _io.emit('circle:sos_alert', alertPayload);
  }

  console.log(`[CIRCLE SOS] ${userName} → notified ${alertRecipients.size} members (${nearbyMembers.length} nearby)`);
  res.json({
    success: true,
    alertId,
    notifiedCount: alertRecipients.size,
    nearbyCount: nearbyMembers.length,
    nearbyMembers: nearbyMembers.slice(0,5),
  });
});

// POST /api/circle/sos/respond
// Member responds to SOS: 'coming', 'called_police', 'checking_in', 'unavailable'
router.post('/sos/respond', (req, res) => {
  const { alertId, responderId, responderName, action, eta } = req.body;
  const alert = activeAlerts.get(alertId);
  if (!alert) return res.status(404).json({ error: 'Alert not found or expired' });

  const response = {
    responderId, responderName,
    action, // 'coming' | 'called_police' | 'checking_in' | 'unavailable'
    eta: eta || null,
    ts: new Date().toISOString(),
  };

  // Remove old response from same user, add new
  alert.responses = alert.responses.filter(r => r.responderId !== responderId);
  alert.responses.push(response);
  activeAlerts.set(alertId, alert);

  // Update responder rating / count if they're coming
  if (action === 'coming' || action === 'called_police') {
    const member = members.get(responderId);
    if (member) {
      member.respondedCount = (member.respondedCount || 0) + 1;
      members.set(responderId, member);
    }
  }

  // Broadcast response to all watching this alert
  if (_io) _io.emit('circle:sos_response', { alertId, response, totalResponders: alert.responses.filter(r => r.action === 'coming').length });

  console.log(`[CIRCLE RESPONSE] ${responderName}: ${action} for alert ${alertId}`);
  res.json({ success: true, response, alert });
});

// POST /api/circle/sos/resolve
// User marks themselves safe
router.post('/sos/resolve', (req, res) => {
  const { alertId, userId } = req.body;
  const alert = activeAlerts.get(alertId);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  alert.status = 'RESOLVED';
  alert.resolvedAt = new Date().toISOString();
  activeAlerts.set(alertId, alert);

  if (_io) _io.emit('circle:sos_resolved', { alertId, userId, resolvedAt: alert.resolvedAt });

  res.json({ success: true });
});

// GET /api/circle/sos/active
// List all active circle alerts (for dashboard)
router.get('/sos/active', (req, res) => {
  const active = Array.from(activeAlerts.values()).filter(a => a.status === 'ACTIVE');
  res.json({ count: active.length, alerts: active });
});

// PATCH /api/circle/members/:userId/location
// Update member location (called every 60s from app)
router.patch('/members/:userId/location', (req, res) => {
  const { lat, lng } = req.body;
  const member = members.get(req.params.userId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  member.lat = parseFloat(lat);
  member.lng = parseFloat(lng);
  member.lastSeen = new Date().toISOString();
  members.set(req.params.userId, member);
  res.json({ success: true });
});

// GET /api/circle/demo/state
// Full state dump for the demo dashboard
router.get('/demo/state', (req, res) => {
  res.json({
    circle: circles.get(DEMO_CIRCLE_ID),
    members: Array.from(members.values()).map(m => ({ ...m, phone: undefined })),
    activeAlerts: Array.from(activeAlerts.values()),
  });
});

module.exports = router;
