import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createDB } from './db.js';
import { verifySolPayment } from './solana.js';
import { tradegptAnswer } from './openai.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/* --- CORS --- */
const ALLOWED = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED.length === 0 || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true
}));

/* --- ENV --- */
const PORT = process.env.PORT || 8080;
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SOL_RECEIVER = process.env.SOL_RECEIVER;
const ACCESS_PRICE_SOL = Number(process.env.ACCESS_PRICE_SOL || '0.01');
const LAMPORTS_PER_SOL = 1_000_000_000;
const PRICE_LAMPORTS = Math.round(ACCESS_PRICE_SOL * LAMPORTS_PER_SOL);
const SECRET = process.env.X402_API_SECRET || 'dev_secret_change_me';

if (!SOL_RECEIVER) {
  console.warn('⚠️  SOL_RECEIVER is not set. Verification will fail until you set it.');
}

/* --- DB --- */
const db = createDB();
await db.init();

/* --- Helpers --- */
function newId() { return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function signToken(payload) { return jwt.sign(payload, SECRET, { expiresIn: '2h' }); }
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch (e) { return res.status(401).json({ error: 'invalid token' }); }
}

/* --- Health --- */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    cors: ALLOWED,
    receiver: SOL_RECEIVER || null,
    price_sol: ACCESS_PRICE_SOL
  });
});

/* --- Prices (for future use) --- */
app.get('/prices', (req, res) => {
  res.json({ tradegpt: ACCESS_PRICE_SOL });
});

/* --- Create session (optional for your frontend flow) --- */
app.post('/x402/session', async (req, res) => {
  const { product = 'tradegpt', chain = 'solana', wallet = null } = req.body || {};
  const sess = await db.createSession({
    id: newId(),
    product,
    chain,
    wallet,
    amount_lamports: PRICE_LAMPORTS,
    receiver: SOL_RECEIVER
  });
  res.json({
    sessionId: sess.id,
    product,
    chain,
    amountSOL: ACCESS_PRICE_SOL,
    receiver: SOL_RECEIVER
  });
});

/* --- Verify payment (server-side) --- */
app.post('/x402/verify', async (req, res) => {
  try {
    const { sessionId, signature } = req.body || {};
    if (!sessionId || !signature) return res.status(400).json({ error: 'sessionId and signature required' });

    const sess = await db.getSession(sessionId);
    if (!sess) return res.status(404).json({ error: 'session not found' });
    if (sess.paid) return res.json({ ok: true, alreadyPaid: true, accessToken: sess.access_token });

    const v = await verifySolPayment({
      rpc: SOLANA_RPC,
      signature,
      to: SOL_RECEIVER,
      minLamports: PRICE_LAMPORTS
    });

    if (!v.ok) return res.status(400).json({ ok: false, reason: v.reason || 'verification failed' });

    const accessToken = signToken({ sid: sessionId, product: sess.product });
    await db.markPaid(sessionId, { sig: signature, access_token: accessToken });

    return res.json({ ok: true, accessToken });
  } catch (e) {
    console.error('verify error', e);
    res.status(500).json({ error: 'verify failed' });
  }
});

/* --- Agent run (requires JWT) --- */
app.post('/agent/run', auth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    // (Optional) fetch session & validate paid
    const sid = req.user?.sid;
    const sess = await db.getSession(sid);
    if (!sess?.paid) return res.status(402).json({ error: 'payment required' });

    const answer = await tradegptAnswer(prompt);

    res.json({
      sessionId: sid,
      answer
    });
  } catch (e) {
    console.error('agent error', e);
    res.status(500).json({ error: 'agent failed' });
  }
});

/* --- Start --- */
app.listen(PORT, () => {
  console.log(`Kira backend running on :${PORT}`);
});
