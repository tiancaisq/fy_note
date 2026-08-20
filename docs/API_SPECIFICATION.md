# 枫叶云笔记 - 云端同步 API 接口规范 (API Specification)

本文档详细定义了枫叶云笔记前端与云端服务端交互的 RESTful API 协议规范。任何遵循该规范实现的服务端（如 PHP、Node.js、Go、Java、Python 等）均可无缝接入前端笔记应用。

服务端示例代码（PHP）已提供在 `docs/server-sample-php/api.php` 中，同时支持 **REST 语义路由** 与 **URL 查询参数路由（?action=...）** 两种模式。

---

## 1. 协议规范基础 (Overview)

- **传输协议**: HTTPS / HTTP
- **数据格式**: JSON (`Content-Type: application/json; charset=utf-8`)
- **字符编码**: UTF-8
- **时间格式**: 字符串时间戳（如 `2026-03-29 14:30:00`）或毫秒级数字时间戳
- **CORS 跨域要求**: 服务端必须在响应头中包含以下内容以支持前端跨域调用：
  ```http
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key
  ```

---

## 2. 身份认证 (Authentication)

客户端请求在 HTTP 请求头中传递凭据：
```http
Authorization: Bearer <YOUR_API_TOKEN>
X-User-Id: <USER_ID> (可选，支持多租户数据隔离，默认 "default_user")
```
- 若服务端未开启 Token 校验，可放行所有请求；
- 若开启了 Token 校验且未通过，返回 HTTP `401 Unauthorized`：
  ```json
  {
    "code": 401,
    "success": false,
    "message": "认证未通过: API Token 无效或未授权"
  }
  ```

---

## 3. 基础响应格式 (Response Schema)

所有接口统一返回以下标准 JSON 数据结构：

```json
{
  "code": 200,
  "success": true,
  "message": "操作成功提示信息",
  "data": { ... },
  "serverTime": 1774771200000
}
```

---

## 4. 同步架构设计理念：增量 vs 全量

| 模式 | 对应接口 | 传输量 | 触发时机 | 优势 |
| :--- | :--- | :--- | :--- | :--- |
| **增量同步 (Incremental)** | `POST /notes`<br>`DELETE /notes/:id`<br>`POST /folders`<br>`DELETE /folders/:id` | 仅单条记录（几百字节~几 KB） | 用户日常编辑防抖保存、新建笔记、删除笔记、拖拽重命名文件夹 | 毫秒级极速响应、极低网络流量消耗 |
| **全量/批量合并 (Full/Batch)** | `POST /sync`<br>`GET /data` | 全量笔记与文件夹列表 | 首次配置云端、多端初次同步、断网数日后手动点击“智能双向合并” | 保障跨设备时间戳仲裁完整性，不漏一条数据 |

---

## 5. API 详细接口定义

### 5.1 连通性与健康检测 (Health / Ping)
- **REST 路由**: `GET /api/ping` 或 `GET /api/health`
- **查询参数路由**: `GET /api.php?action=ping`
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "枫叶云笔记服务端连接正常",
    "data": {
      "service": "fengye-cloud-notes-php-backend",
      "version": "2.0.0",
      "php_version": "8.1.0",
      "userId": "default_user",
      "supportedFeatures": ["incremental_note_sync", "incremental_folder_sync", "batch_merge_sync"]
    },
    "serverTime": 1774771200000
  }
  ```

---

### 5.2 【增量】单篇笔记创建 / 更新 (Upsert Single Note)
用于用户日常编辑、敲字保存、切换标签、标星/收藏等操作，**仅传输当前单篇笔记**。

- **REST 路由**: `POST /api/notes` 或 `PUT /api/notes`
- **查询参数路由**: `POST /api.php?action=upsert_note`
- **请求体 (Request Body)**:
  ```json
  {
    "note": {
      "id": "note-1774771200",
      "folderId": "folder-concurrency",
      "title": "高并发读写分离实战",
      "content": "# Markdown 笔记内容或思维导图 JSON 文本...",
      "format": "markdown",
      "type": "markdown",
      "tags": ["高并发", "MySQL"],
      "isStarred": true,
      "isFavorite": false,
      "isShared": false,
      "isDeleted": false,
      "createdAt": "2026-03-29 14:00:00",
      "updatedAt": "2026-03-29 14:35:10"
    }
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "笔记已增量同步至云端",
    "data": {
      "id": "note-1774771200",
      "updatedAt": "2026-03-29 14:35:10"
    },
    "serverTime": 1774771200000
  }
  ```

---

### 5.3 【增量】单篇笔记删除 (Delete Single Note)
- **REST 路由**: `DELETE /api/notes/:id`
- **查询参数路由**: `DELETE /api.php?action=delete_note&id=note-1774771200`
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "云端笔记已删除",
    "data": {
      "id": "note-1774771200",
      "deleted": true
    },
    "serverTime": 1774771200000
  }
  ```

---

### 5.4 【增量】单个文件夹创建 / 重命名 / 排序 (Upsert Single Folder)
- **REST 路由**: `POST /api/folders`
- **查询参数路由**: `POST /api.php?action=upsert_folder`
- **请求体 (Request Body)**:
  ```json
  {
    "folder": {
      "id": "folder-1774771200",
      "parentId": null,
      "name": "微服务架构设计",
      "order": 1,
      "isCollapsed": false,
      "color": "#3b82f6",
      "createdAt": "2026-03-29 14:00:00",
      "updatedAt": "2026-03-29 14:00:00"
    }
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "文件夹已增量同步至云端",
    "data": { "id": "folder-1774771200" },
    "serverTime": 1774771200000
  }
  ```

---

### 5.5 【增量】单个文件夹删除 (Delete Single Folder)
- **REST 路由**: `DELETE /api/folders/:id`
- **查询参数路由**: `DELETE /api.php?action=delete_folder&id=folder-1774771200`
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "云端文件夹已删除",
    "data": { "id": "folder-1774771200", "deleted": true },
    "serverTime": 1774771200000
  }
  ```

---

### 5.6 【全量】获取云端全部数据 (Get All Cloud Data)
- **REST 路由**: `GET /api/data`
- **查询参数路由**: `GET /api.php?action=data`
- **响应示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "全量云端数据获取成功",
    "data": {
      "folders": [ ... ],
      "notes": [ ... ],
      "notesCount": 35,
      "foldersCount": 8
    },
    "serverTime": 1774771200000
  }
  ```

---

### 5.7 【全量】双向智能合并与全量覆盖 (Batch Sync & Merge)
- **REST 路由**: `POST /api/sync`
- **查询参数路由**: `POST /api.php?action=sync`
- **请求体 (Request Body)**:
  ```json
  {
    "action": "merge",
    "notes": [ ... ],
    "folders": [ ... ],
    "timestamp": 1774771200000
  }
  ```
- **合并规则 (Smart Merge Algorithm)**:
  - 两端记录基于 `id` 主键与 `updatedAt` 时间戳进行两两比对；
  - 本地更新时间戳 $\ge$ 云端时间戳时，写入云端；
  - 云端更新时间戳 $>$ 本地时间戳时，从云端回写覆盖本地，保证所有设备数据自动收敛至最新版本。

---

## 6. cURL 极速调试命令

### 1. 测试连通性
```bash
curl -X GET "http://localhost:8000/api.php?action=ping"
```

### 2. 增量保存单篇笔记
```bash
curl -X POST "http://localhost:8000/api.php?action=upsert_note" \
  -H "Content-Type: application/json" \
  -d '{
    "note": {
      "id": "note-demo-1",
      "folderId": "folder-concurrency",
      "title": "测试单篇增量笔记",
      "content": "# 测试内容",
      "format": "markdown",
      "type": "markdown",
      "tags": ["测试"],
      "createdAt": "2026-03-29 12:00:00",
      "updatedAt": "2026-03-29 12:00:00"
    }
  }'
```

### 3. 删除单篇笔记
```bash
curl -X DELETE "http://localhost:8000/api.php?action=delete_note&id=note-demo-1"
```
