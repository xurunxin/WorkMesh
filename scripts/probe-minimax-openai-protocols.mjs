// Credential-safe endpoint discovery for the WorkMesh OpenAI-compatible adapters.
const key = process.env.MINIMAX_CN_API_KEY;
if (!key) { console.error('MINIMAX_CN_API_KEY is unavailable'); process.exit(2); }
const cases = [
  ['chat', 'https://api.minimax.cn/v1/chat/completions', { model: 'MiniMax-M3', messages: [{ role: 'user', content: 'Reply READY.' }], max_tokens: 128 }],
  ['responses', 'https://api.minimax.cn/v1/responses', { model: 'MiniMax-M3', input: 'Reply READY.', max_output_tokens: 128 }],
];
let failed = false;
for (const [protocol, url, body] of cases) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal, redirect: 'error',
    });
    const payload = await response.json().catch(() => null);
    const text = protocol === 'chat' ? payload?.choices?.[0]?.message?.content : payload?.output_text;
    console.log(JSON.stringify({ protocol, status: response.status,
      model: typeof payload?.model === 'string' ? payload.model : null,
      hasAssistantText: typeof text === 'string' && text.trim().length > 0,
      responseStatus: typeof payload?.status === 'string' ? payload.status : null,
      providerCode: payload?.base_resp?.status_code ?? payload?.error?.code ?? null,
    }));
    if (!response.ok || typeof text !== 'string' || text.trim().length === 0) failed = true;
  } catch (error) {
    console.log(JSON.stringify({ protocol, error: error?.name === 'AbortError' ? 'timeout' : 'request_failed' }));
    failed = true;
  } finally { clearTimeout(timeout); }
}
if (failed) process.exitCode = 1;
