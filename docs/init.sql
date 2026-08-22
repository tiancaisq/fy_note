-- ==============================================================================
-- 枫叶云笔记 (Fengye Cloud Notes) - MySQL 数据库初始化 SQL 脚本
-- 兼容版本: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+
-- 字符集: utf8mb4 / 排序规则: utf8mb4_unicode_ci
-- ==============================================================================

-- 1. 创建数据库（若不存在）
CREATE DATABASE IF NOT EXISTS `fengye_notes`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `fengye_notes`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 2. 文件夹表 (folders)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `folders`;
CREATE TABLE `folders` (
  `id` VARCHAR(64) NOT NULL COMMENT '文件夹唯一ID (如 folder-concurrency)',
  `user_id` VARCHAR(64) NOT NULL DEFAULT 'default_user' COMMENT '用户标识',
  `parent_id` VARCHAR(64) DEFAULT NULL COMMENT '父级文件夹ID，顶级为NULL',
  `name` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '文件夹名称',
  `order_num` INT NOT NULL DEFAULT 0 COMMENT '排序权重',
  `is_collapsed` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否折叠(0否,1是)',
  `color` VARCHAR(32) DEFAULT NULL COMMENT '文件夹自定义标识色',
  `created_at` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '创建时间字符串',
  `updated_at` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '更新时间字符串',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除(0正常,1已删)',
  PRIMARY KEY (`id`),
  KEY `idx_user_parent` (`user_id`, `parent_id`, `order_num`),
  KEY `idx_user_updated` (`user_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件夹目录树表';

-- ------------------------------------------------------------------------------
-- 3. 笔记表 (notes)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `notes`;
CREATE TABLE `notes` (
  `id` VARCHAR(64) NOT NULL COMMENT '笔记唯一ID (如 note-1)',
  `user_id` VARCHAR(64) NOT NULL DEFAULT 'default_user' COMMENT '用户标识',
  `folder_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '所属文件夹ID',
  `title` VARCHAR(255) NOT NULL DEFAULT '未命名笔记' COMMENT '笔记标题',
  `content` MEDIUMTEXT NOT NULL COMMENT 'Markdown正文或思维导图JSON内容',
  `format` VARCHAR(32) NOT NULL DEFAULT 'markdown' COMMENT '格式(markdown/mindmap)',
  `type` VARCHAR(32) NOT NULL DEFAULT 'markdown' COMMENT '笔记类型',
  `tags` TEXT DEFAULT NULL COMMENT 'JSON标签数组',
  `is_starred` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否标星关注(0否,1是)',
  `is_favorite` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否收藏(0否,1是)',
  `is_shared` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否分享(0否,1是)',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否在回收站(0否,1是)',
  `created_at` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '创建时间字符串',
  `updated_at` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '更新时间字符串',
  PRIMARY KEY (`id`),
  KEY `idx_user_folder` (`user_id`, `folder_id`, `is_deleted`),
  KEY `idx_user_status` (`user_id`, `is_starred`, `is_favorite`, `is_deleted`),
  KEY `idx_user_updated` (`user_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记及思维导图主表';

-- ------------------------------------------------------------------------------
-- 4. 用户设置与常用目录配置表 (user_settings)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `user_settings`;
CREATE TABLE `user_settings` (
  `user_id` VARCHAR(64) NOT NULL DEFAULT 'default_user' COMMENT '用户标识',
  `setting_key` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '配置键名 (如 frequent_folder_ids)',
  `setting_value` MEDIUMTEXT DEFAULT NULL COMMENT '配置值 (JSON 字符串或纯文本)',
  `updated_at` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '最后修改时间',
  PRIMARY KEY (`user_id`, `setting_key`),
  KEY `idx_user_updated` (`user_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户个人配置与偏好设置表';

-- ------------------------------------------------------------------------------
-- 5. 同步操作审计日志表 (sync_logs)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `sync_logs`;
CREATE TABLE `sync_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL COMMENT '日志主键',
  `user_id` VARCHAR(64) NOT NULL DEFAULT 'default_user' COMMENT '操作用户ID',
  `sync_mode` VARCHAR(32) NOT NULL DEFAULT 'merge' COMMENT '同步模式(merge/push_all/pull_all)',
  `notes_count` INT NOT NULL DEFAULT 0 COMMENT '客户端上传笔记数量',
  `folders_count` INT NOT NULL DEFAULT 0 COMMENT '客户端上传文件夹数量',
  `client_ip` VARCHAR(45) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` VARCHAR(255) DEFAULT NULL COMMENT '客户端User Agent',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '同步发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='云端同步审计日志表';

-- ------------------------------------------------------------------------------
-- 6. 初始化演示种子数据 (Seed Data)
-- ------------------------------------------------------------------------------

-- 插入基础文件夹
INSERT INTO `folders` (`id`, `user_id`, `parent_id`, `name`, `order_num`, `is_collapsed`, `color`, `created_at`, `updated_at`) VALUES
('folder-concurrency', 'default_user', NULL, '高并发架构设计', 1, 0, '#3b82f6', '2026-03-20 10:00:00', '2026-03-20 10:00:00'),
('folder-mysql', 'default_user', 'folder-concurrency', 'MySQL 深度调优', 1, 0, '#10b981', '2026-03-20 10:05:00', '2026-03-20 10:05:00'),
('folder-redis', 'default_user', 'folder-concurrency', 'Redis 高可用架构', 2, 0, '#f59e0b', '2026-03-20 10:06:00', '2026-03-20 10:06:00'),
('folder-kafka', 'default_user', 'folder-concurrency', 'Kafka 分布式消息队列', 3, 0, '#8b5cf6', '2026-03-20 10:07:00', '2026-03-20 10:07:00'),
('folder-k8s', 'default_user', NULL, '云原生与 Kubernetes', 2, 0, '#06b6d4', '2026-03-21 09:00:00', '2026-03-21 09:00:00'),
('folder-frontend', 'default_user', NULL, '前端现代技术栈', 3, 0, '#ec4899', '2026-03-22 14:00:00', '2026-03-22 14:00:00');

-- 插入基础示例笔记
INSERT INTO `notes` (`id`, `user_id`, `folder_id`, `title`, `content`, `format`, `type`, `tags`, `is_starred`, `is_favorite`, `is_shared`, `is_deleted`, `created_at`, `updated_at`) VALUES
('note-1', 'default_user', 'folder-mysql', 'MySQL 亿级数据分库分表与读写分离实战方案', '# MySQL 亿级数据分库分表与读写分离实战方案\n\n## 1. 业务背景与性能瓶颈\n当单表数据量突破 2000 万行，B+ 树深度从 3 层增加到 4 层时，查询延迟显著增加...\n\n```sql\n-- 查看索引区分度\nSHOW INDEX FROM orders;\n```\n\n## 2. 分片键选择策略\n- 用户维度分片：以 `user_id` 进行 Hash 取模\n- 时间维度冷热分库：冷数据归档到 ClickHouse', 'markdown', 'markdown', '["MySQL", "高并发", "架构"]', 1, 1, 1, 0, '2026-03-25 14:30:00', '2026-03-25 14:30:00'),

('note-2', 'default_user', 'folder-redis', 'Redis 缓存雪崩、穿透、击穿三大难题终极解决方案', '# Redis 缓存雪崩、穿透、击穿终极解决方案\n\n## 1. 缓存穿透（Cache Penetration）\n查询一个根本不存在的数据，绕过缓存直接冲击数据库。\n- **方案一**: 布隆过滤器（BloomFilter）\n- **方案二**: 缓存空对象 + 设置较短过期时间（如 60s）', 'markdown', 'markdown', '["Redis", "缓存", "高性能"]', 1, 0, 0, 0, '2026-03-26 11:20:00', '2026-03-26 11:20:00'),

('note-3', 'default_user', 'folder-concurrency', '高并发系统全景架构脑图', '{"id":"root","text":"高并发系统架构","children":[{"id":"c1","text":"接入层","children":[{"id":"c11","text":"DNS 轮询与智能解析"},{"id":"c12","text":"Nginx / OpenResty 动静分离"}]},{"id":"c2","text":"服务层","children":[{"id":"c21","text":"微服务治理 (RPC / gRPC)"},{"id":"c22","text":"Sentinel 流量防卫与降级"}]},{"id":"c3","text":"存储层","children":[{"id":"c31","text":"Redis 分布式缓存集群"},{"id":"c32","text":"MySQL 读写分离与分库分表"}]}]}', 'mindmap', 'mindmap', '["思维导图", "架构全景"]', 1, 1, 0, 0, '2026-03-27 16:45:00', '2026-03-27 16:45:00');

-- 插入默认用户配置（常用目录固定项及排序）
INSERT INTO `user_settings` (`user_id`, `setting_key`, `setting_value`, `updated_at`) VALUES
('default_user', 'frequent_folder_ids', '["folder-mysql","folder-redis"]', '2026-03-27 18:00:00')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = VALUES(`updated_at`);

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- 初始化完成！数据库 fengye_notes 已就绪
-- ==============================================================================
