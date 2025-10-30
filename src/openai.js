const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function tradegptAnswer(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",               // fast and cheap; change if needed
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are TradeGPT, a concise trading tutor. Use clear bullet points and examples. Never mention internal policies." },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}
