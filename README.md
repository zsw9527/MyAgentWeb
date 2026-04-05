# MyAgentWeb

基于 **Vue 3** + **Vite** 的 Agent 对话前端：向本地或远程聊天接口发送问题，在页面中展示回复；支持 **会话 id** 串联多轮对话，并对正文做 **打字机式逐字显示**。

---

## 环境要求

- **Node.js** 建议 18+（与 Vite 8 兼容）
- 可选：与本项目对接的 **后端 API**（默认期望监听在 `http://127.0.0.1:8000`，见下文）

---

## 安装依赖

在项目根目录执行：

```bash
npm install
```

---

## 本地开发

### 1. 启动前端

```bash
npm run dev
```

终端会输出本地地址（一般为 **http://localhost:5173/** ），用浏览器打开即可使用聊天界面。

### 2. 启动后端（若自行对接接口）

前端默认通过 **相对路径** `/v1/chat` 发请求。开发环境下，Vite 已将 **`/v1` 代理到** `http://127.0.0.1:8000`（见 `vite.config.js`），因此你需要在本机 **8000 端口** 提供接口，例如：

- 实际后端地址：`http://127.0.0.1:8000/v1/chat`

若后端未启动，浏览器或终端可能出现代理连接失败（如 `ECONNREFUSED 127.0.0.1:8000`），请先启动后端或修改代理目标。

### 3. 界面操作说明

- 在输入框输入问题，点击 **发送**，或按 **Enter** 发送。
- **Shift + Enter** 换行（不发送）。
- 发送后按钮会处于「生成中…」状态，直至本回复 **打字动画结束** 后才能再次发送。
- 会话：**首次**请求体中 `session_id` 为 `null`；若响应里带有 `sessionId` 或 `session_id`（或响应头 `x-session-id` / `session-id`），前端会保存并在 **后续请求** 中自动带上。

---

## 生产构建与预览

```bash
npm run build
```

产物输出到 `dist/`。可将 `dist` 部署到任意静态资源服务器（Nginx、对象存储静态站点等）。

本地预览构建结果：

```bash
npm run preview
```

---

## 接口约定（与后端对齐）

### 请求

- **方法**：`POST`
- **路径（开发）**：`/v1/chat`（经 Vite 代理到 `http://127.0.0.1:8000/v1/chat`）
- **Header**：`Content-Type: application/json`
- **Body 示例**：

```json
{
  "message": "你好",
  "session_id": null
}
```

多轮对话时，`session_id` 为字符串（由上一轮响应中解析得到）。

### 响应中用于前端的字段

| 用途 | 说明 |
|------|------|
| **正文** | JSON 中的 **`reply`**（字符串）。流式场景下，每条可解析的 JSON 若含 `reply`，会拼入展示缓冲。 |
| **会话** | 根级 **`sessionId`** 或 **`session_id`**；或通过响应头 **`x-session-id`** / **`session-id`** 传递。 |

### 响应形态（前端解析能力简述）

`src/utils/streamChat.js` 会按 `Content-Type` 等处理：

- `text/event-stream`：按 **SSE**（`data:` 行）解析，并从 JSON 中取 `reply`、`sessionId`/`session_id`。
- `application/json`：整段 JSON 一次解析。
- NDJSON：按行 JSON。
- 其它：按 **纯文本流** 分块读取（此时无法从 JSON 取 `reply`，需与后端格式一致）。

若正文只认 JSON 里的 **`reply`**，请尽量使用带 `reply` 字段的 JSON 或 SSE 包装，避免仅返回无结构的纯流且依赖字段解析。

---

## 环境变量

| 变量 | 作用 |
|------|------|
| **`VITE_CHAT_URL`** | 聊天接口 **完整 URL**（含路径）。未设置时，开发环境使用默认 **`/v1/chat`**（走 Vite 代理）。 |

**生产环境**若前端与 API **不同源**，需将 `VITE_CHAT_URL` 设为实际地址（并在后端配置 **CORS**），或在网关层将前端与 API 反代到同源。

示例（`.env.production`）：

```env
VITE_CHAT_URL=https://your-api.example.com/v1/chat
```

修改后需重新执行 `npm run build`。

---

## 项目结构（简要）

| 路径 | 说明 |
|------|------|
| `src/components/AgentChat.vue` | 聊天 UI、请求体、`session_id`、打字机间隔 `TYPEWRITER_MS` |
| `src/utils/streamChat.js` | 流式/JSON/SSE 解析、`reply` 与 session 提取 |
| `vite.config.js` | Vue 插件、开发代理 `/v1` → `http://127.0.0.1:8000` |

---

## 打字机速度

在 `AgentChat.vue` 中常量 **`TYPEWRITER_MS`**（默认约 `36`）表示每个字符的间隔（毫秒）。数值越大越慢，可按观感调整。

---

## 从 GitHub 克隆后

```bash
git clone https://github.com/zsw9527/MyAgentWeb.git
cd MyAgentWeb
npm install
npm run dev
```

---

## 常见问题

1. **代理报错 `ECONNREFUSED 127.0.0.1:8000`**  
   后端未监听 8000，或端口不一致。请启动后端，或修改 `vite.config.js` 里 `proxy['/v1'].target`。

2. **跨域**  
   开发时尽量使用默认代理访问 `/v1/chat`；生产环境配置 `VITE_CHAT_URL` 并在服务端允许浏览器来源。

3. **界面无正文或提示未解析到 `reply`**  
   确认响应 JSON（或 SSE 每条 `data`）中包含字符串字段 **`reply`**，或与 `streamChat.js` 的解析方式一致。

---

## 技术栈

- [Vue 3](https://vuejs.org/)（`<script setup>` 单文件组件）
- [Vite](https://vite.dev/)
