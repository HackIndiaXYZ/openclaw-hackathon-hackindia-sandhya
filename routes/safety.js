// ─── routes/safety.js ─────────────────────────────────────────────────────────
// Add to your existing server.js: app.use('/api/safety', require('./routes/safety'))

const express = require('express');
const router  = express.Router();

// ─── Seeded demo data (Bangalore) — replace with PostgreSQL in prod ───────────
let incidents = [
  { id: 'i1',  lat: 12.9352, lng: 77.6245, type: 'catcalling',  severity: 2, time: '21:30', area: 'Koramangala', ts: Date.now() - 86400000 * 2, reports: 3 },
  { id: 'i2',  lat: 12.9279, lng: 77.6271, type: 'stalking',    severity: 4, time: '22:00', area: 'Koramangala', ts: Date.now() - 86400000 * 1, reports: 1 },
  { id: 'i3',  lat: 12.9716, lng: 77.5946, type: 'assault',     severity: 5, time: '23:15', area: 'MG Road',     ts: Date.now() - 86400000 * 3, reports: 5 },
  { id: 'i4',  lat: 12.9698, lng: 77.5985, type: 'catcalling',  severity: 2, time: '20:45', area: 'MG Road',     ts: Date.now() - 86400000 * 1, reports: 2 },
  { id: 'i5',  lat: 12.9610, lng: 77.6387, type: 'stalking',    severity: 3, time: '21:00', area: 'Indiranagar',  ts: Date.now() - 86400000 * 5, reports: 1 },
  { id: 'i6',  lat: 12.9629, lng: 77.6382, type: 'groping',     severity: 4, time: '22:30', area: 'Indiranagar',  ts: Date.now() - 86400000 * 2, reports: 4 },
  { id: 'i7',  lat: 12.9791, lng: 77.5912, type: 'catcalling',  severity: 2, time: '19:30', area: 'Cubbon Park',  ts: Date.now() - 86400000 * 7, reports: 2 },
  { id: 'i8',  lat: 12.9141, lng: 77.6101, type: 'assault',     severity: 5, time: '23:00', area: 'BTM Layout',   ts: Date.now() - 86400000 * 1, reports: 6 },
  { id: 'i9',  lat: 12.9121, lng: 77.6089, type: 'stalking',    severity: 3, time: '21:45', area: 'BTM Layout',   ts: Date.now() - 86400000 * 4, reports: 2 },
  { id: 'i10', lat: 12.9250, lng: 77.5938, type: 'catcalling',  severity: 2, time: '20:00', area: 'Jayanagar',    ts: Date.now() - 86400000 * 3, reports: 1 },
  { id: 'i11', lat: 12.9850, lng: 77.5533, type: 'groping',     severity: 4, time: '22:00', area: 'Rajajinagar',  ts: Date.now() - 86400000 * 2, reports: 3 },
  { id: 'i12', lat: 12.9380, lng: 77.6140, type: 'stalking',    severity: 3, time: '21:20', area: 'HSR Layout',   ts: Date.now() - 86400000 * 6, reports: 1 },
];

let safeZones = [
  { id: 'z1', lat: 12.9716, lng: 77.5946, name: 'MG Road Metro', type: 'metro',   safetyScore: 88, reviews: 127, amenities: ['CCTV', 'Security', 'Well-lit', 'Busy'] },
  { id: 'z2', lat: 12.9610, lng: 77.6387, name: 'Indiranagar 100ft', type: 'market', safetyScore: 82, reviews: 94, amenities: ['Busy', 'CCTV', 'Restaurants'] },
  { id: 'z3', lat: 12.9352, lng: 77.6245, name: 'Koramangala Forum', type: 'mall',  safetyScore: 91, reviews: 203, amenities: ['Security', 'CCTV', 'Busy', 'Well-lit'] },
  { id: 'z4', lat: 12.9791, lng: 77.5912, name: 'Cubbon Park Gate', type: 'park',  safetyScore: 64, reviews: 45,  amenities: ['Police Post', 'Well-lit (partial)'] },
  { id: 'z5', lat: 12.9141, lng: 77.6101, name: 'BTM BDA Complex',  type: 'govt',  safetyScore: 72, reviews: 38,  amenities: ['Security', 'Well-lit'] },
];

// ─── GET /api/safety/incidents ────────────────────────────────────────────────
// Returns all incidents for heatmap rendering
// Query params: ?lat=12.97&lng=77.59&radius=3&days=7
router.get('/incidents', (req, res) => {
  const { lat, lng, radius = 5, days = 30 } = req.query;
  const cutoff = Date.now() - days * 86400000;

  let filtered = incidents.filter(i => i.ts > cutoff);

  if (lat && lng) {
    filtered = filtered.filter(i => {
      const d = haversine(parseFloat(lat), parseFloat(lng), i.lat, i.lng);
      return d <= parseFloat(radius);
    });
  }

  res.json({ incidents: filtered, count: filtered.length });
});

// ─── GET /api/safety/safezones ────────────────────────────────────────────────
router.get('/safezones', (req, res) => {
  res.json({ zones: safeZones });
});

// ─── POST /api/safety/report ──────────────────────────────────────────────────
// Submit anonymous incident report
router.post('/report', (req, res) => {
  const { lat, lng, type, severity, time, area, description } = req.body;

  if (!lat || !lng || !type) {
    return res.status(400).json({ error: 'lat, lng, type are required' });
  }

  const existing = incidents.find(i =>
    i.type === type &&
    haversine(lat, lng, i.lat, i.lng) < 0.1 &&
    Date.now() - i.ts < 7 * 86400000
  );

  if (existing) {
    existing.reports += 1;
    existing.severity = Math.max(existing.severity, severity || 1);
    return res.json({ success: true, merged: true, incident: existing });
  }

  const incident = {
    id:       'i' + (incidents.length + 1),
    lat:      parseFloat(lat),
    lng:      parseFloat(lng),
    type:     type || 'other',
    severity: parseInt(severity) || 2,
    time:     time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    area:     area || 'Unknown area',
    ts:       Date.now(),
    reports:  1,
  };

  incidents.push(incident);

  console.log(`[REPORT] New incident: ${incident.type} at ${incident.area}`);
  res.json({ success: true, merged: false, incident });
});

// ─── GET /api/safety/routes ───────────────────────────────────────────────────
// Returns 3 candidate routes with safety scores
// Query: ?fromLat=&fromLng=&toLat=&toLng=&time=22:00
router.get('/routes', (req, res) => {
  const { fromLat, fromLng, toLat, toLng, time = '12:00' } = req.query;

  if (!fromLat || !toLat) {
    return res.status(400).json({ error: 'From and to coordinates required' });
  }

  const hour = parseInt(time.split(':')[0]);
  const isNight = hour >= 20 || hour < 6;

  // Generate 3 route options with computed safety scores
  const routes = [
    {
      id: 'A',
      name: 'Main Road Route',
      description: 'Via MG Road & main boulevard',
      distanceKm: 4.2,
      durationMin: 18,
      waypoints: generateWaypoints(parseFloat(fromLat), parseFloat(fromLng), parseFloat(toLat), parseFloat(toLng), 0),
      features: { lit: true, busy: true, cctv: true, policeNearby: true },
      incidentCount: countIncidentsNear(incidents, fromLat, fromLng, toLat, toLng, 0.3),
    },
    {
      id: 'B',
      name: 'Shortcut (Not Recommended)',
      description: 'Via inner lanes & alley shortcuts',
      distanceKm: 2.9,
      durationMin: 12,
      waypoints: generateWaypoints(parseFloat(fromLat), parseFloat(fromLng), parseFloat(toLat), parseFloat(toLng), 1),
      features: { lit: false, busy: false, cctv: false, policeNearby: false },
      incidentCount: countIncidentsNear(incidents, fromLat, fromLng, toLat, toLng, 0.5) + 2,
    },
    {
      id: 'C',
      name: 'Market Route',
      description: 'Via commercial area, slightly longer',
      distanceKm: 5.1,
      durationMin: 22,
      waypoints: generateWaypoints(parseFloat(fromLat), parseFloat(fromLng), parseFloat(toLat), parseFloat(toLng), 2),
      features: { lit: true, busy: true, cctv: false, policeNearby: false },
      incidentCount: Math.max(0, countIncidentsNear(incidents, fromLat, fromLng, toLat, toLng, 0.3) - 1),
    },
  ];

  // Score each route
  const scored = routes.map(r => ({
    ...r,
    safetyScore: computeSafetyScore(r, isNight),
  }));

  // Sort: best safety first
  scored.sort((a, b) => b.safetyScore - a.safetyScore);
  scored[0].recommended = true;

  res.json({ routes: scored, isNight, time });
});

// ─── GET /api/safety/area-score ──────────────────────────────────────────────
router.get('/area-score', (req, res) => {
  const { lat, lng, radius = 0.5 } = req.query;

  const nearby = incidents.filter(i =>
    haversine(parseFloat(lat), parseFloat(lng), i.lat, i.lng) <= parseFloat(radius) &&
    Date.now() - i.ts < 30 * 86400000
  );

  const score = Math.max(10, 100 - nearby.reduce((sum, i) => sum + i.severity * i.reports * 3, 0));

  res.json({
    score: Math.round(score),
    incidentCount: nearby.length,
    incidents: nearby,
    label: score >= 80 ? 'SAFE' : score >= 55 ? 'MODERATE' : 'AVOID',
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeSafetyScore(route, isNight) {
  let score = 100;
  score -= route.incidentCount * 12;
  if (!route.features.lit)          score -= isNight ? 20 : 5;
  if (!route.features.busy)         score -= isNight ? 15 : 5;
  if (!route.features.cctv)         score -= 8;
  if (!route.features.policeNearby) score -= 5;
  return Math.max(5, Math.min(98, Math.round(score)));
}

function countIncidentsNear(incidents, fromLat, fromLng, toLat, toLng, buffer) {
  const minLat = Math.min(fromLat, toLat) - buffer;
  const maxLat = Math.max(+fromLat, +toLat) + buffer;
  const minLng = Math.min(fromLng, toLng) - buffer;
  const maxLng = Math.max(+fromLng, +toLng) + buffer;
  return incidents.filter(i =>
    i.lat >= minLat && i.lat <= maxLat &&
    i.lng >= minLng && i.lng <= maxLng &&
    Date.now() - i.ts < 30 * 86400000
  ).length;
}

function generateWaypoints(fromLat, fromLng, toLat, toLng, variant) {
  const offsets = [
    [0.002, 0.001],
    [-0.003, -0.002],
    [0.001, 0.004],
  ];
  const [dLat, dLng] = offsets[variant];
  const midLat = (fromLat + toLat) / 2 + dLat;
  const midLng = (fromLng + toLng) / 2 + dLng;
  return [
    { lat: fromLat, lng: fromLng },
    { lat: midLat,  lng: midLng  },
    { lat: toLat,   lng: toLng   },
  ];
}

module.exports = router;
