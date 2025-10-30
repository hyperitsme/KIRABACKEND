import pg from 'pg';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  chain TEXT NOT NULL,
  wallet TEXT,
  amount_lamports BIGINT NOT NULL,
  receiver TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  paid BOOLEAN DEFAULT FALSE,
  sig TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  access_token TEXT
);
CREATE INDEX IF NOT EXISTS sessions_paid_idx ON sessions(paid);
`;

function mem() {
  const store = new Map();
  return {
    async init(){},
    async createSession(row){ store.set(row.id, row); return row; },
    async getSession(id){ return store.get(id) || null; },
    async markPaid(id, data){ const r = store.get(id); if(!r) return null; Object.assign(r, data); store.set(id,r); return r; }
  };
}

function pgdb(url) {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    async init(){
      const c = await pool.connect();
      try { await c.query(SCHEMA_SQL); } finally { c.release(); }
    },
    async createSession(row){
      const q = `INSERT INTO sessions (id,product,chain,wallet,amount_lamports,receiver,paid)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
      const v = [row.id,row.product,row.chain,row.wallet,row.amount_lamports,row.receiver,false];
      const { rows } = await pool.query(q, v);
      return rows[0];
    },
    async getSession(id){
      const { rows } = await pool.query(`SELECT * FROM sessions WHERE id=$1`, [id]);
      return rows[0] || null;
    },
    async markPaid(id, data){
      const { rows } = await pool.query(
        `UPDATE sessions SET paid=$2,sig=$3,paid_at=now(),access_token=$4 WHERE id=$1 RETURNING *`,
        [id, true, data.sig, data.access_token]
      );
      return rows[0] || null;
    }
  };
}

export function createDB() {
  const url = process.env.DATABASE_URL;
  if (url) return pgdb(url);
  return mem();
}
