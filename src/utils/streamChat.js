/**
 * 从接口 JSON 中取展示文本（仅使用 reply）
 */
export function extractTextFromJson(obj) {
  if (obj == null) return ''
  if (typeof obj === 'string') return obj
  if (typeof obj.reply === 'string') return obj.reply
  return ''
}

/** 从响应 JSON 取会话 id（支持 sessionId / session_id） */
export function extractSessionId(obj) {
  if (obj == null || typeof obj !== 'object') return null
  const v = obj.sessionId ?? obj.session_id
  if (v == null || v === '') return null
  return String(v)
}

function emitSessionIfPresent(obj, onSessionId) {
  if (!onSessionId) return
  const sid = extractSessionId(obj)
  if (sid != null) onSessionId(sid)
}

/**
 * 消费 fetch 的 Response：支持 SSE、纯文本分块、NDJSON、一次性 JSON
 * @param {{ onSessionId?: (id: string) => void }} [options]
 */
export async function consumeChatStream(response, onDelta, options = {}) {
  const { onSessionId } = options
  const ct = response.headers.get('content-type') || ''

  const hdrSid =
    response.headers.get('x-session-id')?.trim() ||
    response.headers.get('session-id')?.trim()
  if (hdrSid && onSessionId) onSessionId(hdrSid)

  if (!response.body) {
    const data = await response.json()
    emitSessionIfPresent(data, onSessionId)
    const t = extractTextFromJson(data)
    if (t) onDelta(t)
    return
  }

  if (ct.includes('text/event-stream')) {
    await readSSE(response.body, onDelta, onSessionId)
    return
  }

  if (ct.includes('ndjson') || ct.includes('x-ndjson')) {
    await readNdjson(response.body, onDelta, onSessionId)
    return
  }

  if (ct.includes('application/json')) {
    const raw = await response.text()
    try {
      const data = JSON.parse(raw)
      emitSessionIfPresent(data, onSessionId)
      onDelta(extractTextFromJson(data))
    } catch {
      onDelta(raw)
    }
    return
  }

  await readPlain(response.body, onDelta)
}

async function readPlain(body, onDelta) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (chunk) onDelta(chunk)
  }
}

async function readNdjson(body, onDelta, onSessionId) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    carry += decoder.decode(value, { stream: true })
    const lines = carry.split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const j = JSON.parse(trimmed)
        emitSessionIfPresent(j, onSessionId)
        const t = extractTextFromJson(j)
        if (t) onDelta(t)
      } catch {
        onDelta(trimmed)
      }
    }
  }
  const last = carry.trim()
  if (last) {
    try {
      const j = JSON.parse(last)
      emitSessionIfPresent(j, onSessionId)
      const t = extractTextFromJson(j)
      if (t) onDelta(t)
    } catch {
      onDelta(last)
    }
  }
}

async function readSSE(body, onDelta, onSessionId) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '')
      buffer = buffer.slice(nl + 1)
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue
      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trimStart()
        if (data === '[DONE]') continue
        let piece = ''
        try {
          const parsed = JSON.parse(data)
          emitSessionIfPresent(parsed, onSessionId)
          piece = extractTextFromJson(parsed)
        } catch {
          piece = data
        }
        if (piece) onDelta(piece)
      }
    }
  }
}
