// routes/blockchain.js
// Add to server.js:
//   const blockchain = require('./routes/blockchain');
//   blockchain.init();
//   app.use('/api/blockchain', blockchain.router);
// Then call blockchain.logSOS(...) inside your /api/sos/trigger handler

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

// ─── State ────────────────────────────────────────────────────────────────────
let web3, contract, account;
let ready = false;

// In-memory mock ledger (used when chain unavailable)
const mockLedger = [];

// ─── Incident type enum (matches Solidity) ────────────────────────────────────
const IncidentType = { SOS: 0, REPORT: 1, CIRCLE_ALERT: 2 };

// ─── Load ABI ─────────────────────────────────────────────────────────────────
function loadABI() {
  // Try ABI file saved by deploy script first
  const abiFile = path.join(__dirname, 'SafeGuardRegistry.abi.json');
  if (fs.existsSync(abiFile)) {
    return JSON.parse(fs.readFileSync(abiFile, 'utf8'));
  }
  // Embedded minimal ABI fallback
  return [
    { inputs:[{name:'incidentHash',type:'bytes32'},{name:'itype',type:'uint8'},{name:'area',type:'string'},{name:'severity',type:'uint8'}], name:'logIncident',    outputs:[{type:'bool'}], stateMutability:'nonpayable', type:'function' },
    { inputs:[{name:'incidentHash',type:'bytes32'}],                                                                                       name:'resolveIncident', outputs:[{type:'bool'}], stateMutability:'nonpayable', type:'function' },
    { inputs:[{name:'area',type:'string'}],                                                                                                name:'getAreaCount',    outputs:[{type:'uint256'}], stateMutability:'view', type:'function' },
    { inputs:[{name:'incidentHash',type:'bytes32'}],                                                                                       name:'isLogged',        outputs:[{type:'bool'}], stateMutability:'view', type:'function' },
    { inputs:[],                                                                                                                           name:'getStats',        outputs:[{name:'total',type:'uint256'},{name:'resolved',type:'uint256'},{name:'active',type:'uint256'}], stateMutability:'view', type:'function' },
    { inputs:[],                                                                                                                           name:'owner',           outputs:[{type:'address'}], stateMutability:'view', type:'function' },
    { anonymous:false, inputs:[{indexed:true,name:'incidentHash',type:'bytes32'},{indexed:false,name:'itype',type:'uint8'},{indexed:false,name:'area',type:'string'},{indexed:false,name:'severity',type:'uint8'},{indexed:false,name:'timestamp',type:'uint256'}], name:'IncidentLogged', type:'event' },
    { anonymous:false, inputs:[{indexed:false,name:'area',type:'string'},{indexed:false,name:'count',type:'uint256'},{indexed:false,name:'detectedAt',type:'uint256'}], name:'PatternDetected', type:'event' },
  ];
}

// ─── Init (call once at server startup) ───────────────────────────────────────
async function init() {
  let Web3;
  try {
    const w = require('web3');
    Web3 = w.Web3 || w.default || w;
  } catch {
    console.log('[BLOCKCHAIN] ⚠  web3 not installed — mock mode');
    console.log('[BLOCKCHAIN]    Fix: npm install web3');
    return;
  }

  const rpc     = process.env.BLOCKCHAIN_RPC     || 'http://127.0.0.1:7545';
  const address = process.env.CONTRACT_ADDRESS;
  const privkey = process.env.BLOCKCHAIN_PRIVKEY;

  if (!address) {
    console.log('[BLOCKCHAIN] ⚠  CONTRACT_ADDRESS missing in .env — mock mode');
    console.log('[BLOCKCHAIN]    Fix: cd blockchain && npm install && npm run deploy');
    return;
  }

  try {
    web3 = new Web3(rpc);
    const block = await web3.eth.getBlockNumber();
    console.log(`[BLOCKCHAIN] Connected to ${rpc} (block #${block})`);

    if (privkey) {
      const pk = privkey.startsWith('0x') ? privkey : '0x' + privkey;
      account  = web3.eth.accounts.privateKeyToAccount(pk);
      web3.eth.accounts.wallet.add(account);
    } else {
      const accs = await web3.eth.getAccounts();
      account = { address: accs[0] };
    }

    contract = new web3.eth.Contract(loadABI(), address);
    const stats = await contract.methods.getStats().call();
    console.log(`[BLOCKCHAIN] ✅ Contract at ${address}`);
    console.log(`[BLOCKCHAIN]    Stats: ${stats.total} logged, ${stats.resolved} resolved`);
    console.log(`[BLOCKCHAIN]    Signing as: ${account.address}`);
    ready = true;
  } catch(e) {
    console.log('[BLOCKCHAIN] ⚠  Connection failed:', e.message);
    console.log('[BLOCKCHAIN]    Is Ganache running? npx ganache --port 7545 --chainId 1337');
    console.log('[BLOCKCHAIN]    Falling back to mock mode');
  }
}

// ─── Hash — privacy-safe, no PII on-chain ─────────────────────────────────────
function makeHash(id, area, ts) {
  const raw  = `${id}:${area}:${ts}:${process.env.HASH_SALT || 'safeguard'}`;
  return '0x' + crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── Core write functions ─────────────────────────────────────────────────────
async function _write(hash, itype, area, severity, refId) {
  const entry = { hash, itype, area, severity, refId, ts: new Date().toISOString(), resolved: false };

  if (!ready) {
    const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
    mockLedger.push({ ...entry, txHash: fakeHash, mock: true });
    const label = Object.keys(IncidentType).find(k => IncidentType[k] === itype);
    console.log(`[BLOCKCHAIN MOCK] ${label} | area:${area} | tx:${fakeHash.slice(0,14)}...`);
    return { success:true, txHash:fakeHash, hash, mock:true };
  }

  try {
    const tx = await contract.methods
      .logIncident(hash, itype, area, severity)
      .send({ from: account.address, gas: 300000 });

    const txHash = tx.transactionHash;
    const patternDetected = !!tx.events?.PatternDetected;
    console.log(`[BLOCKCHAIN] ✅ tx:${txHash.slice(0,14)}... block:${tx.blockNumber}${patternDetected?' ⚠ PATTERN':''}` );
    return { success:true, txHash, hash, blockNumber:tx.blockNumber, patternDetected };
  } catch(e) {
    // Never crash SOS flow
    const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
    console.error('[BLOCKCHAIN] write failed:', e.message);
    mockLedger.push({ ...entry, txHash: fakeHash, mock:true, error:e.message });
    return { success:false, error:e.message, txHash:fakeHash, mock:true };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function logSOS(sosId, area, severity = 3) {
  const hash = makeHash(sosId, area, Date.now());
  return _write(hash, IncidentType.SOS, area, Math.min(5, Math.max(1, severity)), sosId);
}

async function logReport(reportId, area, severity = 2) {
  const hash = makeHash(reportId, area, Date.now());
  return _write(hash, IncidentType.REPORT, area, Math.min(5, Math.max(1, severity)), reportId);
}

async function logCircleAlert(alertId, area) {
  const hash = makeHash(alertId, area, Date.now());
  return _write(hash, IncidentType.CIRCLE_ALERT, area, 2, alertId);
}

async function resolveOnChain(sosId, area) {
  if (!ready) {
    const e = mockLedger.find(m => m.refId === sosId);
    if (e) { e.resolved = true; e.resolvedAt = new Date().toISOString(); }
    return { success:true, mock:true };
  }
  try {
    const hash = makeHash(sosId, area, 0); // must match hash used at log time
    const tx   = await contract.methods.resolveIncident(hash).send({ from:account.address, gas:100000 });
    return { success:true, txHash:tx.transactionHash };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

async function checkPattern(area) {
  if (!ready) {
    const count = mockLedger.filter(e => e.area === area && !e.resolved).length;
    return { area, count, pattern: count >= 3, mock:true };
  }
  try {
    const count = Number(await contract.methods.getAreaCount(area).call());
    return { area, count, pattern: count >= 3 };
  } catch(e) {
    return { area, count:0, pattern:false, error:e.message };
  }
}

async function getStats() {
  if (!ready) {
    return {
      total:    mockLedger.length,
      resolved: mockLedger.filter(e => e.resolved).length,
      active:   mockLedger.filter(e => !e.resolved).length,
      mock: true,
    };
  }
  try {
    const s = await contract.methods.getStats().call();
    return { total:Number(s.total), resolved:Number(s.resolved), active:Number(s.active) };
  } catch(e) {
    return { total:0, resolved:0, active:0, error:e.message };
  }
}

// ─── Express Routes ───────────────────────────────────────────────────────────

// GET /api/blockchain/status
router.get('/status', async (req, res) => {
  const stats = await getStats();
  res.json({
    connected: ready,
    mode:      ready ? 'live' : 'mock',
    rpc:       process.env.BLOCKCHAIN_RPC || 'http://127.0.0.1:7545',
    contract:  process.env.CONTRACT_ADDRESS || null,
    account:   account?.address || null,
    stats,
  });
});

// GET /api/blockchain/ledger  — last 50 entries (mock mode) or recent hashes
router.get('/ledger', async (req, res) => {
  if (!ready) {
    return res.json({
      mode:    'mock',
      entries: mockLedger.slice(-50).reverse(),
      total:   mockLedger.length,
    });
  }
  try {
    const hashes = await contract.methods.getRecentIncidents(10).call().catch(() => []);
    res.json({ mode:'live', recentHashes: hashes, total: (await getStats()).total });
  } catch(e) {
    res.json({ mode:'live', error:e.message });
  }
});

// GET /api/blockchain/pattern/:area
router.get('/pattern/:area', async (req, res) => {
  res.json(await checkPattern(decodeURIComponent(req.params.area)));
});

// GET /api/blockchain/stats
router.get('/stats', async (req, res) => {
  res.json(await getStats());
});

// POST /api/blockchain/verify  { hash }
router.post('/verify', async (req, res) => {
  const { hash } = req.body;
  if (!hash) return res.status(400).json({ error:'hash required' });
  if (!ready) {
    const e = mockLedger.find(m => m.hash === hash);
    return res.json({ found:!!e, entry: e||null, mock:true });
  }
  try {
    const logged = await contract.methods.isLogged(hash).call();
    res.json({ found: logged });
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

module.exports = { router, init, logSOS, logReport, logCircleAlert, resolveOnChain, checkPattern, getStats };
