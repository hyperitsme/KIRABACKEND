// Minimal Solana transfer verification via JSON-RPC
export async function verifySolPayment({ rpc, signature, to, minLamports }) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
  };
  const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  const tx = json?.result;
  if (!tx) return { ok:false, reason:'TX not found' };

  // ensure success
  if (tx.meta?.err) return { ok:false, reason:'TX error' };

  // find receiver index
  const keys = tx.transaction.message.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey));
  const toIdx = keys.indexOf(to);
  if (toIdx < 0) return { ok:false, reason:'Receiver not in accountKeys' };

  // check lamports increase for receiver
  const pre = tx.meta?.preBalances?.[toIdx] ?? 0;
  const post = tx.meta?.postBalances?.[toIdx] ?? 0;
  const delta = post - pre;

  if (delta >= minLamports) {
    return { ok:true, lamports: delta, slot: tx.slot };
  }
  return { ok:false, reason:`Insufficient delta: ${delta}` };
}
