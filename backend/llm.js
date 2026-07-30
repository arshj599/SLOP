export async function llmJson({ tier, system, user, fallback }) {
  const endpoint = process.env.SLOP_LLM_ENDPOINT;
  const apiKey = process.env.SLOP_LLM_API_KEY;
  if (!endpoint || !apiKey) return fallback();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ tier, system, user, response_format: 'json' })
  });
  if (!response.ok) return fallback();
  const payload = await response.json();
  const text = payload.output_text || payload.text || payload.choices?.[0]?.message?.content;
  if (!text) return fallback();
  try { return JSON.parse(text); } catch { return fallback(); }
}
