// Small, credential-safe live gate for the China MiniMax M3 endpoint.
// Run with MINIMAX_CN_API_KEY in the environment. Never print the key or body.
const apiKey = process.env.MINIMAX_CN_API_KEY;
if (!apiKey) {
  console.error('MINIMAX_CN_API_KEY is unavailable');
  process.exitCode = 2;
} else {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch('https://api.minimax.cn/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'MiniMax-M3', messages: [{ role: 'user', content: 'Reply with exactly READY.' }], max_tokens: 128 }),
      signal: controller.signal,
      redirect: 'error',
    });
    const payload = await response.json().catch(() => null);
    const choice = payload?.choices?.[0];
    const text = choice?.message?.content;
    const result = {
      httpStatus: response.status,
      model: typeof payload?.model === 'string' ? payload.model : null,
      hasAssistantText: typeof text === 'string' && text.trim().length > 0,
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      errorCode: payload?.base_resp?.status_code ?? payload?.error?.code ?? null,
      usageAvailable: Boolean(payload?.usage),
    };
    console.log(JSON.stringify(result));
    if (!response.ok || !result.hasAssistantText) process.exitCode = 1;
  } catch (error) {
    console.error(error?.name === 'AbortError' ? 'MINIMAX_TIMEOUT' : 'MINIMAX_REQUEST_FAILED');
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}
