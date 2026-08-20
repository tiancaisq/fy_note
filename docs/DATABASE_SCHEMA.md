# 枫叶云笔记 - 服务端数据库设计文档 (Database Schema)

本文档详细说明了枫叶云笔记（Fengye Cloud Notes）服务端关系型数据库（MySQL / MariaDB / PostgreSQL）的表结构设计与字段定义。

---

## 1. 数据库架构设计概览 (Overview)

- **字符集**: `utf8mb4`
- **排序规则**: `utf8mb4_unicode_ci`
- **存储引擎**: `InnoDB`
- **主键策略**: 字符串 ID (`VARCHAR(64)`)，保持与客户端 UUID / 前缀 ID 绝对一致，便于离线创建与去中心化生成。

### 实体关系 (ER Diagram Concept)
```
+------------------+         +------------------+
|     folders      | 1     N |      notes       |
|------------------|---------|------------------|
| id (PK)          |         | id (PK)          |
| user_id          |         | folder_id (FK)   |
| parent_id (self) |         | user_id          |
| name             |         | title            |
| order_num        |         | content          |
| is_collapsed     |         | format / type    |
| updated_at       |         | is_starred       |
+------------------+         | is_favorite      |
                             | is_deleted       |
                             | updated_at       |
                             +------------------+
```

---

## 2. 数据表详细定义

### 2.1 文件夹表 (`folders`)

用于存储多层级嵌套文件夹目录树结构。

| 字段名 | 类型 | 是否为空 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | NOT NULL | 无 | 文件夹唯一标识 (主键，如 `folder-concurrency`) |
| `user_id` | `VARCHAR(64)` | NOT NULL | `'default_user'` | 所属用户账号 ID / 租户标识 |
| `parent_id` | `VARCHAR(64)` | NULL | `NULL` | 父文件夹 ID (顶级为 NULL) |
| `name` | `VARCHAR(128)` | NOT NULL | `''` | 文件夹名称 |
| `order_num` | `INT` | NOT NULL | `0` | 同级同组自定义排序权重 (越小越靠前) |
| `is_collapsed` | `TINYINT(1)` | NOT NULL | `0` | 是否在侧边栏折叠 (0: 展开, 1: 折叠) |
| `color` | `VARCHAR(32)` | NULL | `NULL` | 文件夹自定义标识色 (HEX，如 `#3b82f6`) |
| `created_at` | `VARCHAR(32)` | NOT NULL | `''` | 创建时间 (格式 `YYYY-MM-DD HH:mm:ss`) |
| `updated_at` | `VARCHAR(32)` | NOT NULL | `''` | 最后修改时间 (用于冲突检测与增量同步) |
| `is_deleted` | `TINYINT(1)` | NOT NULL | `0` | 软删除标记 (0: 正常, 1: 已删除) |

**索引设计**:
- 主键索引: `PRIMARY KEY (id)`
- 联合索引: `KEY idx_user_parent (user_id, parent_id, order_num)`
- 时间索引: `KEY idx_user_updated (user_id, updated_at)`

---

### 2.2 笔记表 (`notes`)

用于存储所有 Markdown 笔记、代码片段及思维导图（XMind 格式 JSON）文档。

| 字段名 | 类型 | 是否为空 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | NOT NULL | 无 | 笔记唯一标识 (主键，如 `note-1711200000abc`) |
| `user_id` | `VARCHAR(64)` | NOT NULL | `'default_user'` | 所属用户账号 ID |
| `folder_id` | `VARCHAR(64)` | NOT NULL | `''` | 所属文件夹 ID |
| `title` | `VARCHAR(255)` | NOT NULL | `'未命名笔记'` | 笔记标题 |
| `content` | `MEDIUMTEXT` | NOT NULL | `''` | 笔记内容 (Markdown 源码或思维导图 JSON) |
| `format` | `VARCHAR(32)` | NOT NULL | `'markdown'` | 格式类型 (`markdown` / `mindmap`) |
| `type` | `VARCHAR(32)` | NOT NULL | `'markdown'` | 笔记类型 (`markdown` / `mindmap`) |
| `tags` | `TEXT` | NULL | `NULL` | 标签列表 (以 JSON 数组形式存储，如 `["MySQL","架构"]`) |
| `is_starred` | `TINYINT(1)` | NOT NULL | `0` | 是否星标特别关注 (0: 否, 1: 是) |
| `is_favorite` | `TINYINT(1)` | NOT NULL | `0` | 是否收藏 (0: 否, 1: 是) |
| `is_shared` | `TINYINT(1)` | NOT NULL | `0` | 是否已生成分享 (0: 否, 1: 是) |
| `is_deleted` | `TINYINT(1)` | NOT NULL | `0` | 是否在回收站 (0: 正常, 1: 回收站) |
| `created_at` | `VARCHAR(32)` | NOT NULL | `''` | 创建时间字符串 |
| `updated_at` | `VARCHAR(32)` | NOT NULL | `''` | 更新时间字符串 (同步仲裁依据) |

**索引设计**:
- 主键索引: `PRIMARY KEY (id)`
- 联合索引: `KEY idx_user_folder (user_id, folder_id, is_deleted)`
- 状态索引: `KEY idx_user_status (user_id, is_starred, is_favorite, is_deleted)`
- 时间索引: `KEY idx_user_updated (user_id, updated_at)`

---

### 2.3 同步审计日志表 (`sync_logs`)

记录每一次客户端同步行为、变更数量与客户端信息，用于运维回溯与审计。

| 字段名 | 类型 | 是否为空 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGINT AUTO_INCREMENT` | NOT NULL | 自增 | 自增日志 ID |
| `user_id` | `VARCHAR(64)` | NOT NULL | `'default_user'` | 同步操作账号 |
| `sync_mode` | `VARCHAR(32)` | NOT NULL | `'merge'` | 同步模式 (`merge` / `push_all` / `pull_all`) |
| `notes_count` | `INT` | NOT NULL | `0` | 同步前本地发送的笔记数 |
| `folders_count` | `INT` | NOT NULL | `0` | 同步前本地发送的文件夹数 |
| `client_ip` | `VARCHAR(45)` | NULL | `NULL` | 客户端来源 IP |
| `user_agent` | `VARCHAR(255)` | NULL | `NULL` | 客户端设备 User-Agent |
| `created_at` | `DATETIME` | NOT NULL | `CURRENT_TIMESTAMP` | 记录生成时间 |

---

## 3. 冲突仲裁与时间戳机制 (Conflict Resolution)

1. **LWW (Last-Write-Wins, 最后写入胜出)**:
   - 客户端与服务端每项数据均维护 `updatedAt` 时间。
   - 当执行 `merge` 操作时：如果客户端版本的 `updatedAt` 比服务端记录的时间更新，则覆盖服务端；反之若服务端的时间更新，则由服务端将最新版本回传给客户端，客户端写入本地。
2. **离线操作支持**:
   - 用户在离线状态下生成的新笔记具有本地时间戳；连接网络后执行同步，系统自动将其作为新增记录推送到数据库中。
