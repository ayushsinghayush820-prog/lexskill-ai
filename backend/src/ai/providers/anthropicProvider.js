const env = require('../../config/env');

// Calls the Anthropic Messages API from the BACKEND only. The key never reaches the browser.
async function complete({ system, user, maxTokens = 4000, timeoutMs = 90000 }) {
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY is not configured on the server.');
  if (!env.LLM_MODEL) throw new Error('LLM_MODEL is not configured on the server.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.LLM_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM API returned ${res.status}. ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!text) throw new Error('LLM API returned no text.');
    return {
      text,
      model: data.model,
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : null,
    };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('LLM request timed out.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { name: 'anthropic', complete };