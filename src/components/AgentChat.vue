<script setup>
import { ref, nextTick, watch } from 'vue'
import { consumeChatStream } from '../utils/streamChat.js'

const CHAT_URL = import.meta.env.VITE_CHAT_URL || '/v1/chat'

const messages = ref([])
const input = ref('')
const sending = ref(false)
const listEl = ref(null)
/** 首次为 null，接口返回 sessionId / session_id 后写入，后续请求携带 */
const sessionId = ref(null)

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(
  messages,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1
  sending.value = true

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        session_id: sessionId.value,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      messages.value[assistantIndex].content = `请求失败 (${res.status}): ${errBody.slice(0, 500)}`
      return
    }

    await consumeChatStream(
      res,
      (chunk) => {
        messages.value[assistantIndex].content += chunk
      },
      {
        onSessionId: (id) => {
          sessionId.value = id
        },
      }
    )

    if (!messages.value[assistantIndex].content.trim()) {
      messages.value[assistantIndex].content =
        '（未解析到 reply 文本，请确认返回 JSON 中含字符串字段 reply）'
    }
  } catch (e) {
    messages.value[assistantIndex].content = `网络错误: ${e?.message ?? String(e)}`
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="chat">
    <header class="chat__header">
      <h1 class="chat__title">Agent 对话</h1>
      <p class="chat__hint">POST {{ CHAT_URL }} · 流式展示回复</p>
    </header>

    <div ref="listEl" class="chat__messages" role="log" aria-live="polite">
      <p v-if="messages.length === 0" class="chat__empty">输入问题后发送，回复会逐字显示。</p>
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="msg"
        :class="m.role === 'user' ? 'msg--user' : 'msg--assistant'"
      >
        <span class="msg__label">{{ m.role === 'user' ? '你' : 'Agent' }}</span>
        <div class="msg__bubble">{{ m.content }}</div>
      </div>
    </div>

    <div class="chat__composer">
      <textarea
        v-model="input"
        class="chat__input"
        rows="3"
        placeholder="输入问题…（Enter 发送，Shift+Enter 换行）"
        :disabled="sending"
        @keydown="onKeydown"
      />
      <button type="button" class="chat__send" :disabled="sending || !input.trim()" @click="send">
        {{ sending ? '生成中…' : '发送' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  text-align: left;
}

.chat__header {
  flex-shrink: 0;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.chat__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-h);
}

.chat__hint {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text);
  opacity: 0.85;
  word-break: break-all;
}

.chat__messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}

.chat__empty {
  margin: 0;
  color: var(--text);
  opacity: 0.75;
  font-size: 0.95rem;
}

.msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 100%;
}

.msg--user {
  align-items: flex-end;
}

.msg__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text);
  opacity: 0.65;
  margin-bottom: 0.25rem;
}

.msg__bubble {
  max-width: min(100%, 42rem);
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--border);
  background: var(--code-bg);
  color: var(--text-h);
}

.msg--user .msg__bubble {
  background: var(--accent-bg);
  border-color: var(--accent-border);
}

.msg--assistant .msg__bubble {
  background: var(--bg);
}

.chat__composer {
  flex-shrink: 0;
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

.chat__input {
  flex: 1;
  resize: vertical;
  min-height: 3.25rem;
  max-height: 12rem;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--code-bg);
  color: var(--text-h);
  font: inherit;
  line-height: 1.45;
  box-sizing: border-box;
}

.chat__input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.chat__input:disabled {
  opacity: 0.65;
}

.chat__send {
  flex-shrink: 0;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  border: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--accent);
  color: #fff;
}

.chat__send:hover:not(:disabled) {
  filter: brightness(1.05);
}

.chat__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
