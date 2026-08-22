# 枫叶云笔记 - 云端同步 API 接口规范 (API Specification)

本文档详细定义了枫叶云笔记前端与云端服务端交互的标准 API 协议规范。服务端（如 PHP、Node.js、Go、Java、Python 等）只要遵循本规范中的 `?action=xxx` 接口格式与字段定义，即可无缝接入笔记客户端。

服务端标准实现代码已同步更新在 `docs/server-sample-php/api.php` 中，采用**显式 Action 路由分发机制**，逻辑清晰无歧义。

---

## 1. 协议规范基础 (Overview)

- **传输协议**: HTTPS / HTTP
- **数据格式**: JSON (`Content-Type: application/json; charset=utf-8`)
- **字符编码**: UTF-8
- **时间格式**: ISO 字符串时间（如 `2026-08-21 14:30:00`）或标准 ISO8601
- **路由调用规范**: 采用显式 Query 参数模式 `?action=xxx`（如 `api.php?action=pull`）
- **CORS 跨域要求**: 服务端必须在响应头中包含以下内容以支持浏览器跨域调用：
  ```http
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key
  Access-Control-Max-Age: 86400
  ```

---

## 2. 身份认证与多用户隔离 (Authentication & Tenant)

客户端在 HTTP 请求头或 Query 参数中传递认证与用户凭据：

```http
Authorization: Bearer <YOUR_API_TOKEN> 或 X-Api-Key: <YOUR_API_TOKEN>
X-User-Id: <USER_ID> (可选，支持多用户独立数据隔离，未传默认 "default_user")
```

- 若服务端未开启 Token 校验，可放行所有请求；
- 若开启了 Token 校验且未通过，返回 HTTP `401 Unauthorized`：
  ```json
  {
    "code": 401,
    "success": false,
    "message": "认证未通过: API Token 无效或未授权",
    "data": null,
    "serverTime": 1787291992000
  }
  ```

---

## 3. 基础响应格式 (Response Schema)

所有接口均统一返回以下标准 JSON 数据结构：

```json
{
  "code": 200,
  "success": true,
  "message": "操作成功提示信息",
  "data": { ... },
  "serverTime": 1787291992000
}
```

- `code` *(int)*: 业务状态码，成功为 200，失败返回对应 HTTP 状态码（如 400, 401, 404, 405, 500）
- `success` *(bool)*: 布尔值，true 表示操作成功，false 表示失败
- `message` *(string)*: 人类可读的操作提示或错误说明
- `data` *(object|null)*: 响应的数据负载
- `serverTime` *(int)*: 服务端毫秒级时间戳，用于客户端校验时钟偏移

---

## 4. 核心接口清单

| 操作指令 (`action`) | 请求方法 | 接口功能 | 核心用途 |
| :--- | :---: | :--- | :--- |
| **`ping`** / `health` | `GET` | 服务健康检测 | 连通性测试、探测服务端版本与数据库状态 |
| **`pull`** / `data` | `GET` | 全量数据拉取 | 首次加载、换设备初始化、包含常用目录列表拉取 |
| **`sync`** | `POST` | 双向智能合并 / 全量覆盖 | 批量提交本地数据与常用目录，按时间戳智能合并 |
| **`upsert_note`** | `POST` | 单篇笔记保存 | 敲字编辑实时增量同步 |
| **`delete_note`** | `POST`/`DELETE` | 单篇笔记删除 | 彻底移除指定 ID 笔记 |
| **`upsert_folder`** | `POST` | 单个文件夹保存 | 文件夹新建、重命名、排序、折叠同步 |
| **`delete_folder`** | `POST`/`DELETE` | 单个文件夹删除 | 彻底移除指定 ID 文件夹并自动解绑常用目录 |
| **`frequent_folders`** | `GET` | 获取常用目录列表 | 拉取用户固定的常用目录 ID 有序列表 |
| **`upsert_frequent_folders`** | `POST` | 更新/保存常用目录 | 新增固定、拖拽排序、全量或单项增删常用目录 |
| **`delete_frequent_folder`** | `POST`/`DELETE` | 移除常用目录固定 | 从常用目录固定列表中解绑指定文件夹 |
| **`empty_trash`** | `POST`/`DELETE` | 清空回收站 | 彻底从云端物理删除废弃笔记 |

---

## 5. 接口详细说明

### 5.1 服务健康检测 (Ping / Health)
- **请求方式**: `GET`
- **请求路径**: `?action=ping`
- **功能描述**: 用于客户端设置界面中的「测试连接」按钮，验证服务端与数据库可用性。
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "枫叶云笔记服务端连接正常",
    "data": {
      "service": "fengye-cloud-notes-backend",
      "version": "2.1.0",
      "phpVersion": "8.0.26",
      "userId": "default_user",
      "database": "connected",
      "timestamp": 1787291992000
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.2 全量数据拉取 (Pull / Data)
- **请求方式**: `GET`
- **请求路径**: `?action=pull`
- **功能描述**: 获取当前用户名下的全部文件夹列表与全部笔记数据。
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "全量云端数据获取成功",
    "data": {
      "folders": [
        {
          "id": "folder-work",
          "name": "工作笔记",
          "parentId": null,
          "order": 0,
          "isCollapsed": false,
          "color": "#e06c75",
          "createdAt": "2026-08-20 10:00:00",
          "updatedAt": "2026-08-21 08:30:00"
        }
      ],
      "frequentFolderIds": ["folder-work"],
      "notes": [
        {
          "id": "note-101",
          "title": "项目技术架构规范",
          "content": "# 项目架构规范\n\n1. 前后端数据隔离...",
          "folderId": "folder-work",
          "format": "markdown",
          "type": "markdown",
          "tags": ["规范", "后端"],
          "isStarred": true,
          "isFavorite": false,
          "isShared": false,
          "isDeleted": false,
          "createdAt": "2026-08-20 10:30:00",
          "updatedAt": "2026-08-21 09:15:00"
        }
      ],
      "foldersCount": 1,
      "notesCount": 1,
      "frequentFoldersCount": 1
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.3 双向智能合并 / 全量数据推送 (Batch Sync)
- **请求方式**: `POST`
- **请求路径**: `?action=sync`
- **请求体 (JSON Body)**:
  ```json
  {
    "mode": "merge", // "merge" (双向最新时间戳合并) / "push_all" (强制覆盖云端)
    "notes": [
      {
        "id": "note-101",
        "title": "更新后的标题",
        "content": "最新编辑的内容...",
        "folderId": "folder-work",
        "format": "markdown",
        "type": "markdown",
        "tags": ["架构"],
        "isStarred": true,
        "isFavorite": false,
        "isShared": false,
        "isDeleted": false,
        "createdAt": "2026-08-20 10:30:00",
        "updatedAt": "2026-08-21 09:40:00"
      }
    ],
    "folders": [
      {
        "id": "folder-work",
        "name": "工作笔记",
        "parentId": null,
        "order": 0,
        "isCollapsed": false,
        "color": "#e06c75",
        "createdAt": "2026-08-20 10:00:00",
        "updatedAt": "2026-08-21 08:30:00"
      }
    ],
    "frequentFolderIds": ["folder-work"],
    "deletedNoteIds": ["note-deleted-1"],
    "deletedFolderIds": ["folder-deleted-1"]
  }
  ```
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "数据同步成功",
    "data": {
      "folders": [ ... ],
      "notes": [ ... ],
      "frequentFolderIds": [ ... ],
      "foldersCount": 1,
      "notesCount": 1,
      "frequentFoldersCount": 1
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.4 单篇笔记保存 (Upsert Note)
- **请求方式**: `POST`
- **请求路径**: `?action=upsert_note`
- **请求体 (JSON Body)**:
  ```json
  {
    "note": {
      "id": "note-101",
      "folderId": "folder-work",
      "title": "我的第一篇笔记",
      "content": "这里是正文内容...",
      "format": "markdown",
      "type": "markdown",
      "tags": ["工作", "计划"],
      "isStarred": true,
      "isFavorite": false,
      "isShared": false,
      "isDeleted": false,
      "createdAt": "2026-08-21 10:00:00",
      "updatedAt": "2026-08-21 10:05:00"
    }
  }
  ```
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "笔记已成功同步至云端",
    "data": {
      "id": "note-101",
      "updatedAt": "2026-08-21 10:05:00"
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.5 单篇笔记删除 (Delete Note)
- **请求方式**: `POST` 或 `DELETE`
- **请求路径**: `?action=delete_note&id=note-101` 或在请求体中传 `{"id": "note-101"}`
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "云端笔记已删除",
    "data": {
      "id": "note-101",
      "deleted": true
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.6 单个文件夹保存 (Upsert Folder)
- **请求方式**: `POST`
- **请求路径**: `?action=upsert_folder`
- **请求体 (JSON Body)**:
  ```json
  {
    "folder": {
      "id": "folder-work",
      "name": "工作笔记",
      "parentId": null,
      "order": 1,
      "isCollapsed": false,
      "color": "#4a90e2",
      "createdAt": "2026-08-21 09:00:00",
      "updatedAt": "2026-08-21 09:30:00"
    }
  }
  ```
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "文件夹已成功同步至云端",
    "data": {
      "id": "folder-work",
      "updatedAt": "2026-08-21 09:30:00"
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.7 单个文件夹删除 (Delete Folder)
- **请求方式**: `POST` 或 `DELETE`
- **请求路径**: `?action=delete_folder&id=folder-work` 或在请求体中传 `{"id": "folder-work"}`
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "云端文件夹已删除",
    "data": {
      "id": "folder-work",
      "deleted": true
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.8 清空回收站 (Empty Trash)
- **请求方式**: `POST` 或 `DELETE`
- **请求路径**: `?action=empty_trash` 或 `?action=clear_trash`
- **请求体 (JSON Body，可选)**:
  ```json
  {
    "noteIds": ["note-deleted-1", "note-deleted-2"]
  }
  ```
  *(说明: 若未传 `noteIds`，服务端默认将该用户下所有 `is_deleted = 1` 的回收站笔记物理彻底删除)*
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "云端回收站已清空",
    "data": {
      "deletedCount": 2
    },
    "serverTime": 1787291992000
  }
  ```

---

### 5.9 获取常用目录列表 (Get Frequent Folders)
- **请求方式**: `GET`
- **请求路径**: `?action=frequent_folders` 或 `/api/frequent-folders`
- **功能描述**: 获取当前用户固定置顶在「常用目录」栏目中的文件夹 ID 有序数组。
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "常用目录获取成功",
    "data": {
      "frequentFolderIds": ["folder-concurrency", "folder-mysql"],
      "count": 2,
      "serverTime": 1787291992000
    },
    "frequentFolderIds": ["folder-concurrency", "folder-mysql"],
    "serverTime": 1787291992000
  }
  ```

---

### 5.10 新增/排序/保存常用目录 (Upsert / Reorder Frequent Folders)
- **请求方式**: `POST` 或 `PUT`
- **请求路径**: `?action=upsert_frequent_folders` 或 `/api/frequent-folders`
- **请求体 (支持以下形式)**:
  - **形式一（全量有序列表/拖拽重新排序）**:
    ```json
    {
      "frequentFolderIds": ["folder-mysql", "folder-concurrency", "folder-k8s"]
    }
    ```
  - **形式二（单个新增置顶常用目录）**:
    ```json
    {
      "folderId": "folder-frontend",
      "action": "add"
    }
    ```
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "常用目录已同步更新至云端",
    "data": {
      "frequentFolderIds": ["folder-mysql", "folder-concurrency", "folder-k8s"],
      "count": 3,
      "serverTime": 1787291992000
    },
    "frequentFolderIds": ["folder-mysql", "folder-concurrency", "folder-k8s"],
    "serverTime": 1787291992000
  }
  ```

---

### 5.11 移除常用目录固定 (Delete / Unpin Frequent Folder)
- **请求方式**: `POST` 或 `DELETE`
- **请求路径**: `?action=delete_frequent_folder&id=folder-mysql` 或 `/api/frequent-folders/folder-mysql`
- **返回示例**:
  ```json
  {
    "code": 200,
    "success": true,
    "message": "常用目录已从云端移除",
    "data": {
      "id": "folder-mysql",
      "frequentFolderIds": ["folder-concurrency", "folder-k8s"],
      "serverTime": 1787291992000
    },
    "frequentFolderIds": ["folder-concurrency", "folder-k8s"],
    "serverTime": 1787291992000
  }
  ```

---

## 6. 数据模型实体与数据库字段映射

### 6.1 笔记对象 (Note Entity)
| 字段名 (`TypeScript / JSON`) | 数据库字段 (`MySQL`) | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `id` | VARCHAR(64) | 笔记唯一 UUID，主键 |
| `userId` | `user_id` | VARCHAR(64) | 所属用户 ID |
| `folderId` | `folder_id` | VARCHAR(64) | 所属文件夹 ID (顶级为 `""` 或 `NULL`) |
| `title` | `title` | VARCHAR(255) | 笔记标题 |
| `content` | `content` | LONGTEXT | 笔记 Markdown 或纯文本内容 |
| `format` | `format` | VARCHAR(32) | 内容格式 (`markdown`, `rich`, `mindmap`) |
| `type` | `type` | VARCHAR(32) | 笔记类型 (`markdown`, `mindmap`) |
| `tags` | `tags` | JSON / TEXT | 标签字符串数组，如 `["工作", "计划"]` |
| `isStarred` | `is_starred` | TINYINT(1) | 是否置顶/标星 (`0` 或 `1`) |
| `isFavorite` | `is_favorite` | TINYINT(1) | 是否收藏 (`0` 或 `1`) |
| `isShared` | `is_shared` | TINYINT(1) | 是否已分享 (`0` 或 `1`) |
| `isDeleted` | `is_deleted` | TINYINT(1) | 是否处于回收站 (`0` 或 `1`) |
| `createdAt` | `created_at` | DATETIME | 创建时间 (ISO 字符串) |
| `updatedAt` | `updated_at` | DATETIME | 最后修改时间 (ISO 字符串，用于智能冲突合并) |

### 6.2 文件夹对象 (Folder Entity)
| 字段名 (`TypeScript / JSON`) | 数据库字段 (`MySQL`) | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `id` | VARCHAR(64) | 文件夹唯一 UUID，主键 |
| `userId` | `user_id` | VARCHAR(64) | 所属用户 ID |
| `name` | `name` | VARCHAR(255) | 文件夹显示名称 |
| `parentId` | `parent_id` | VARCHAR(64) | 父级文件夹 ID (顶级为 `null`) |
| `order` | `order_num` | INT | 同级排列序号 |
| `isCollapsed` | `is_collapsed` | TINYINT(1) | 目录树折叠状态 (`0` 或 `1`) |
| `color` | `color` | VARCHAR(32) | 自定义文件夹标记颜色 (可选) |
| `createdAt` | `created_at` | DATETIME | 创建时间 |
| `updatedAt` | `updated_at` | DATETIME | 最后修改时间 |
