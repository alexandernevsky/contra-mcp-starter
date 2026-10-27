const MAX_BYTES = 16 * 1024 * 1024;

export async function withTimeout(timeoutMs, operation) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Timeout must be positive.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await operation(controller.signal); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('Contra request timed out. Inspect account state before retrying a mutation.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function readText(response) {
  if (!response.body) throw new Error('Empty HTTP response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('HTTP response exceeds size limit.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('Invalid JSON response (body omitted).'); }
}

export async function fetchJson(fetchImpl, url, options, timeoutMs = 30000, label = 'Contra') {
  return withTimeout(timeoutMs, async (signal) => {
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal }); }
    catch { throw new Error(`${label} network request failed.`); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${label} failed (HTTP ${response.status}; body omitted).`);
    }
    return parseJson(await readText(response));
  });
}

function responseForId(payload, id) {
  if (!payload || payload.jsonrpc !== '2.0') throw new Error('Invalid JSON-RPC response.');
  if (!Object.hasOwn(payload, 'id')) return undefined;
  if (payload.id !== id) return undefined;
  if (payload.error) {
    const code = Number.isInteger(payload.error.code) ? payload.error.code : 'unknown';
    throw new Error(`Contra JSON-RPC error ${code} (message omitted).`);
  }
  if (!Object.hasOwn(payload, 'result')) throw new Error('JSON-RPC response has no result.');
  return payload;
}

export async function readRpcResponse(response, id) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    const result = responseForId(parseJson(await readText(response)), id);
    if (!result) throw new Error('JSON-RPC response ID does not match request.');
    return result;
  }
  if (type !== 'text/event-stream') { await response.body?.cancel(); throw new Error('Unsupported MCP response content type.'); }
  if (!response.body) throw new Error('Empty MCP stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', bytes = 0, data = [];
  function line(value) {
    if (value === '') {
      const body = data.join('\n'); data = [];
      return body ? responseForId(parseJson(body), id) : undefined;
    }
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    return undefined;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > MAX_BYTES) throw new Error('MCP stream exceeds size limit.');
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // Preserve a trailing CR until the next chunk to handle split CRLF.
      let match;
      while ((match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
        const result = line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (result) return result;
      }
      if (done) {
        if (buffer) {
          const result = line(buffer.replace(/\r$/, ''));
          if (result) return result;
        }
        const result = line('');
        if (result) return result;
        throw new Error('MCP stream ended without the requested response.');
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
