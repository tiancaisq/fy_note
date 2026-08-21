<?php
/**
 * 枫叶云笔记 (Fengye Cloud Notes) - PHP 服务端 RESTful API 完整实现
 * 
 * 运行环境要求: PHP 7.4+ 或 PHP 8.0+，且开启 pdo_mysql 扩展
 * 单文件即插即用，同时支持 REST 路径路由 (Nginx/Apache rewrite) 与查询参数模式 (?action=...)
 */

header('Content-Type: application/json; charset=utf-8');

// 1. 加载配置文件
$configFile = __DIR__ . '/config.php';
$config = file_exists($configFile) ? require $configFile : [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'dbname' => 'fengye_notes',
        'username' => 'root',
        'password' => 'root',
        'charset' => 'utf8mb4'
    ],
    'auth' => ['enable_token' => false, 'secret_token' => 'my_secret_token_123'],
    'cors' => [
        'allowed_origins' => ['*'],
        'allowed_methods' => 'GET, POST, PUT, DELETE, OPTIONS',
        'allowed_headers' => 'Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key'
    ]
];

// 2. 处理 CORS 跨域请求
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: " . ($config['cors']['allowed_methods'] ?? 'GET, POST, PUT, DELETE, OPTIONS'));
header("Access-Control-Allow-Headers: " . ($config['cors']['allowed_headers'] ?? 'Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key'));
header("Access-Control-Max-Age: 86400");

// 响应 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 统一响应输出助手函数
function jsonResponse($code = 200, $success = true, $message = '', $data = null) {
    http_response_code($code);
    echo json_encode([
        'code' => $code,
        'success' => $success,
        'message' => $message,
        'data' => $data,
        'serverTime' => (int)(microtime(true) * 1000)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3. 数据库连接初始化 (PDO)
try {
    $dbCfg = $config['db'];
    $dsn = "mysql:host={$dbCfg['host']};port={$dbCfg['port']};dbname={$dbCfg['dbname']};charset={$dbCfg['charset']}";
    $pdo = new PDO($dsn, $dbCfg['username'], $dbCfg['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    jsonResponse(500, false, '数据库连接失败: ' . $e->getMessage());
}

// 4. 用户身份与 Token 认证校验
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$clientToken = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
    $clientToken = trim($matches[1]);
}

if (!empty($config['auth']['enable_token'])) {
    $expectedToken = $config['auth']['secret_token'] ?? '';
    if (empty($clientToken) || $clientToken !== $expectedToken) {
        jsonResponse(401, false, '认证未通过: API Token 无效或未授权');
    }
}

// 获取用户 ID (支持多用户隔离)
$userId = $_SERVER['HTTP_X_USER_ID'] ?? ($_GET['userId'] ?? 'default_user');

// 5. 请求路径与参数解析
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$action = $_GET['action'] ?? '';
$idParam = $_GET['id'] ?? '';

// 解析请求体 JSON
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?: [];
if (empty($action) && !empty($body['action'])) {
    $action = $body['action'];
}

// 路径路由辅助提取: 如 /fy_api/api.php 或 /api/notes/note-123 或 /notes
$pathSegments = array_values(array_filter(explode('/', $requestUri)));
$resource = end($pathSegments);
$prevResource = count($pathSegments) > 1 ? $pathSegments[count($pathSegments) - 2] : '';

// 提取 RESTful ID (如 DELETE /api/notes/note-123)
if ($prevResource === 'notes' || $prevResource === 'folders') {
    $idParam = $resource;
    $resource = $prevResource;
}

// ==============================================================================
// 路由分发 (Route Handlers)
// ==============================================================================

// ------------------------------------------------------------------------------
// 接口 1: 健康检测 (Health / Ping / Test)
// ------------------------------------------------------------------------------
if (
    $action === 'ping' || 
    $action === 'test' || 
    $action === 'health' || 
    in_array($resource, ['ping', 'health', 'test']) ||
    ($method === 'POST' && (($body['action'] ?? '') === 'ping' || ($body['action'] ?? '') === 'test')) ||
    ($method === 'GET' && (empty($action) || $action === 'ping' || $action === 'test') && ($resource === 'api.php' || $resource === 'api' || empty($resource) || $requestUri === '/'))
) {
    jsonResponse(200, true, '枫叶云笔记服务端连接正常', [
        'service' => 'fengye-cloud-notes-php-backend',
        'version' => '2.0.0',
        'php_version' => PHP_VERSION,
        'userId' => $userId,
        'timestamp' => (int)(microtime(true) * 1000),
        'supportedFeatures' => [
            'incremental_note_sync',   // 单篇笔记增量同步
            'incremental_folder_sync', // 文件夹增量同步
            'batch_merge_sync',        // 全量智能双向合并
            'mindmap_storage',         // 思维导图存储支持
        ]
    ]);
}

// ------------------------------------------------------------------------------
// 接口 2: 获取全量云端数据 (GET /data 或 GET /sync?action=pull)
// ------------------------------------------------------------------------------
if (
    $action === 'data' || 
    $resource === 'data' || 
    ($resource === 'sync' && $method === 'GET') || 
    ($action === 'pull')
) {
    try {
        // 1. 查询文件夹
        $folderStmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId AND is_deleted = 0 ORDER BY order_num ASC");
        $folderStmt->execute([':userId' => $userId]);
        $rawFolders = $folderStmt->fetchAll();

        $folders = array_map(function($f) {
            return [
                'id' => $f['id'],
                'name' => $f['name'],
                'parentId' => $f['parent_id'],
                'order' => (int)$f['order_num'],
                'isCollapsed' => (bool)$f['is_collapsed'],
                'color' => $f['color'] ?? null,
                'createdAt' => $f['created_at'],
                'updatedAt' => $f['updated_at'],
            ];
        }, $rawFolders);

        // 2. 查询笔记
        $noteStmt = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId ORDER BY updated_at DESC");
        $noteStmt->execute([':userId' => $userId]);
        $rawNotes = $noteStmt->fetchAll();

        $notes = array_map(function($n) {
            $tags = [];
            if (!empty($n['tags'])) {
                $decoded = json_decode($n['tags'], true);
                if (is_array($decoded)) $tags = $decoded;
            }
            return [
                'id' => $n['id'],
                'title' => $n['title'],
                'content' => $n['content'],
                'folderId' => $n['folder_id'],
                'format' => $n['format'] ?? 'markdown',
                'type' => $n['type'] ?? 'markdown',
                'tags' => $tags,
                'isStarred' => (bool)$n['is_starred'],
                'isFavorite' => (bool)$n['is_favorite'],
                'isShared' => (bool)$n['is_shared'],
                'isDeleted' => (bool)$n['is_deleted'],
                'createdAt' => $n['created_at'],
                'updatedAt' => $n['updated_at'],
            ];
        }, $rawNotes);

        jsonResponse(200, true, '全量云端数据获取成功', [
            'folders' => $folders,
            'notes' => $notes,
            'notesCount' => count($notes),
            'foldersCount' => count($folders),
        ]);
    } catch (Exception $e) {
        jsonResponse(500, false, '获取数据失败: ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------------------
// 接口 3: 【增量】单篇笔记创建 / 编辑保存 (POST/PUT /notes 或 ?action=upsert_note)
// ------------------------------------------------------------------------------
if (
    ($resource === 'notes' && in_array($method, ['POST', 'PUT'])) ||
    ($action === 'upsert_note' || $action === 'save_note' || ($action === 'notes' && in_array($method, ['POST', 'PUT'])))
) {
    $note = !empty($body['note']) ? $body['note'] : $body;
    if (empty($note['id'])) {
        jsonResponse(400, false, '参数错误: 缺少笔记 ID (id)');
    }

    try {
        $id = $note['id'];
        $folderId = $note['folderId'] ?? '';
        $title = $note['title'] ?? '未命名笔记';
        $content = $note['content'] ?? '';
        $format = $note['format'] ?? 'markdown';
        $type = $note['type'] ?? 'markdown';
        $tags = json_encode($note['tags'] ?? [], JSON_UNESCAPED_UNICODE);
        $isStarred = !empty($note['isStarred']) ? 1 : 0;
        $isFavorite = !empty($note['isFavorite']) ? 1 : 0;
        $isShared = !empty($note['isShared']) ? 1 : 0;
        $isDeleted = !empty($note['isDeleted']) ? 1 : 0;
        $createdAt = $note['createdAt'] ?? date('Y-m-d H:i:s');
        $updatedAt = $note['updatedAt'] ?? date('Y-m-d H:i:s');

        $stmt = $pdo->prepare("INSERT INTO notes 
            (id, user_id, folder_id, title, content, format, type, tags, is_starred, is_favorite, is_shared, is_deleted, created_at, updated_at) 
            VALUES (:id, :userId, :folderId, :title, :content, :format, :type, :tags, :isStarred, :isFavorite, :isShared, :isDeleted, :createdAt, :updatedAt)
            ON DUPLICATE KEY UPDATE 
                folder_id = :uFolderId,
                title = :uTitle,
                content = :uContent,
                format = :uFormat,
                type = :uType,
                tags = :uTags,
                is_starred = :uIsStarred,
                is_favorite = :uIsFavorite,
                is_shared = :uIsShared,
                is_deleted = :uIsDeleted,
                updated_at = :uUpdatedAt");

        $stmt->execute([
            ':id' => $id,
            ':userId' => $userId,
            ':folderId' => $folderId,
            ':title' => $title,
            ':content' => $content,
            ':format' => $format,
            ':type' => $type,
            ':tags' => $tags,
            ':isStarred' => $isStarred,
            ':isFavorite' => $isFavorite,
            ':isShared' => $isShared,
            ':isDeleted' => $isDeleted,
            ':createdAt' => $createdAt,
            ':updatedAt' => $updatedAt,
            ':uFolderId' => $folderId,
            ':uTitle' => $title,
            ':uContent' => $content,
            ':uFormat' => $format,
            ':uType' => $type,
            ':uTags' => $tags,
            ':uIsStarred' => $isStarred,
            ':uIsFavorite' => $isFavorite,
            ':uIsShared' => $isShared,
            ':uIsDeleted' => $isDeleted,
            ':uUpdatedAt' => $updatedAt,
        ]);

        jsonResponse(200, true, '笔记已增量同步至云端', [
            'id' => $id,
            'updatedAt' => $updatedAt,
        ]);
    } catch (Exception $e) {
        jsonResponse(500, false, '单篇笔记保存失败: ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------------------
// 接口 4: 【增量】单篇笔记删除 (DELETE /notes/:id 或 ?action=delete_note&id=...)
// ------------------------------------------------------------------------------
if (
    ($resource === 'notes' && $method === 'DELETE') ||
    $action === 'delete_note' || 
    ($action === 'notes' && $method === 'DELETE')
) {
    $noteId = $idParam ?: ($body['id'] ?? '');
    if (empty($noteId)) {
        jsonResponse(400, false, '参数错误: 缺少待删除的笔记 ID');
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM notes WHERE id = :id AND user_id = :userId");
        $stmt->execute([':id' => $noteId, ':userId' => $userId]);

        jsonResponse(200, true, '云端笔记已删除', [
            'id' => $noteId,
            'deleted' => true,
        ]);
    } catch (Exception $e) {
        jsonResponse(500, false, '删除笔记失败: ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------------------
// 接口 5: 【增量】单个文件夹保存 / 重命名 / 排序 (POST/PUT /folders 或 ?action=upsert_folder)
// ------------------------------------------------------------------------------
if (
    ($resource === 'folders' && in_array($method, ['POST', 'PUT'])) ||
    ($action === 'upsert_folder' || $action === 'save_folder' || ($action === 'folders' && in_array($method, ['POST', 'PUT'])))
) {
    $folder = !empty($body['folder']) ? $body['folder'] : $body;
    if (empty($folder['id'])) {
        jsonResponse(400, false, '参数错误: 缺少文件夹 ID (id)');
    }

    try {
        $id = $folder['id'];
        $parentId = !empty($folder['parentId']) ? $folder['parentId'] : null;
        $name = $folder['name'] ?? '未命名文件夹';
        $orderNum = $folder['order'] ?? 0;
        $isCollapsed = !empty($folder['isCollapsed']) ? 1 : 0;
        $color = $folder['color'] ?? null;
        $createdAt = $folder['createdAt'] ?? date('Y-m-d H:i:s');
        $updatedAt = $folder['updatedAt'] ?? date('Y-m-d H:i:s');

        $stmt = $pdo->prepare("INSERT INTO folders 
            (id, user_id, parent_id, name, order_num, is_collapsed, color, created_at, updated_at, is_deleted)
            VALUES (:id, :userId, :parentId, :name, :orderNum, :isCollapsed, :color, :createdAt, :updatedAt, 0)
            ON DUPLICATE KEY UPDATE 
                parent_id = :uParentId,
                name = :uName,
                order_num = :uOrderNum,
                is_collapsed = :uIsCollapsed,
                color = :uColor,
                updated_at = :uUpdatedAt");

        $stmt->execute([
            ':id' => $id,
            ':userId' => $userId,
            ':parentId' => $parentId,
            ':name' => $name,
            ':orderNum' => $orderNum,
            ':isCollapsed' => $isCollapsed,
            ':color' => $color,
            ':createdAt' => $createdAt,
            ':updatedAt' => $updatedAt,
            ':uParentId' => $parentId,
            ':uName' => $name,
            ':uOrderNum' => $orderNum,
            ':uIsCollapsed' => $isCollapsed,
            ':uColor' => $color,
            ':uUpdatedAt' => $updatedAt,
        ]);

        jsonResponse(200, true, '文件夹已增量同步至云端', [
            'id' => $id,
            'updatedAt' => $updatedAt,
        ]);
    } catch (Exception $e) {
        jsonResponse(500, false, '文件夹保存失败: ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------------------
// 接口 6: 【增量】单个文件夹删除 (DELETE /folders/:id 或 ?action=delete_folder&id=...)
// ------------------------------------------------------------------------------
if (
    ($resource === 'folders' && $method === 'DELETE') ||
    $action === 'delete_folder' || 
    ($action === 'folders' && $method === 'DELETE')
) {
    $folderId = $idParam ?: ($body['id'] ?? '');
    if (empty($folderId)) {
        jsonResponse(400, false, '参数错误: 缺少待删除的文件夹 ID');
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM folders WHERE id = :id AND user_id = :userId");
        $stmt->execute([':id' => $folderId, ':userId' => $userId]);

        jsonResponse(200, true, '云端文件夹已删除', [
            'id' => $folderId,
            'deleted' => true,
        ]);
    } catch (Exception $e) {
        jsonResponse(500, false, '删除文件夹失败: ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------------------
// 接口 7: 【全量】智能合并与全量覆盖同步 (POST /sync 或 ?action=sync)
// ------------------------------------------------------------------------------
if (
    $resource === 'sync' || 
    $action === 'sync' || 
    ($action === 'merge' || $action === 'push_all' || $action === 'pull_all')
) {
    if ($method !== 'POST') {
        jsonResponse(405, false, '同步接口仅支持 POST 请求');
    }

    $mode = $body['action'] ?? ($body['mode'] ?? 'merge');
    $clientNotes = $body['notes'] ?? [];
    $clientFolders = $body['folders'] ?? [];

    try {
        $pdo->beginTransaction();

        // 模式 1: push_all (以本地数据强制覆盖云端)
        if ($mode === 'push_all') {
            // 清理旧数据
            $pdo->prepare("DELETE FROM notes WHERE user_id = :userId")->execute([':userId' => $userId]);
            $pdo->prepare("DELETE FROM folders WHERE user_id = :userId")->execute([':userId' => $userId]);

            // 批量写入文件夹
            $insertFolder = $pdo->prepare("INSERT INTO folders (id, user_id, parent_id, name, order_num, is_collapsed, color, created_at, updated_at, is_deleted) VALUES (:id, :userId, :parentId, :name, :orderNum, :isCollapsed, :color, :createdAt, :updatedAt, 0)");
            foreach ($clientFolders as $f) {
                $insertFolder->execute([
                    ':id' => $f['id'],
                    ':userId' => $userId,
                    ':parentId' => $f['parentId'] ?? null,
                    ':name' => $f['name'] ?? '',
                    ':orderNum' => $f['order'] ?? 0,
                    ':isCollapsed' => !empty($f['isCollapsed']) ? 1 : 0,
                    ':color' => $f['color'] ?? null,
                    ':createdAt' => $f['createdAt'] ?? date('Y-m-d H:i:s'),
                    ':updatedAt' => $f['updatedAt'] ?? date('Y-m-d H:i:s'),
                ]);
            }

            // 批量写入笔记
            $insertNote = $pdo->prepare("INSERT INTO notes (id, user_id, folder_id, title, content, format, type, tags, is_starred, is_favorite, is_shared, is_deleted, created_at, updated_at) VALUES (:id, :userId, :folderId, :title, :content, :format, :type, :tags, :isStarred, :isFavorite, :isShared, :isDeleted, :createdAt, :updatedAt)");
            foreach ($clientNotes as $n) {
                $insertNote->execute([
                    ':id' => $n['id'],
                    ':userId' => $userId,
                    ':folderId' => $n['folderId'] ?? '',
                    ':title' => $n['title'] ?? '未命名笔记',
                    ':content' => $n['content'] ?? '',
                    ':format' => $n['format'] ?? 'markdown',
                    ':type' => $n['type'] ?? 'markdown',
                    ':tags' => json_encode($n['tags'] ?? [], JSON_UNESCAPED_UNICODE),
                    ':isStarred' => !empty($n['isStarred']) ? 1 : 0,
                    ':isFavorite' => !empty($n['isFavorite']) ? 1 : 0,
                    ':isShared' => !empty($n['isShared']) ? 1 : 0,
                    ':isDeleted' => !empty($n['isDeleted']) ? 1 : 0,
                    ':createdAt' => $n['createdAt'] ?? date('Y-m-d H:i:s'),
                    ':updatedAt' => $n['updatedAt'] ?? date('Y-m-d H:i:s'),
                ]);
            }

            $mergedNotes = $clientNotes;
            $mergedFolders = $clientFolders;
        } 
        // 模式 2: pull_all (仅从云端拉取，绝不把本地数据写入云端)
        elseif ($mode === 'pull_all') {
            $fStmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId AND is_deleted = 0 ORDER BY order_num ASC");
            $fStmt->execute([':userId' => $userId]);
            $mergedFolders = array_map(function($f) {
                return [
                    'id' => $f['id'],
                    'name' => $f['name'],
                    'parentId' => $f['parent_id'],
                    'order' => (int)$f['order_num'],
                    'isCollapsed' => (bool)$f['is_collapsed'],
                    'color' => $f['color'] ?? null,
                    'createdAt' => $f['created_at'],
                    'updatedAt' => $f['updated_at'],
                ];
            }, $fStmt->fetchAll());

            $nStmt = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId ORDER BY updated_at DESC");
            $nStmt->execute([':userId' => $userId]);
            $mergedNotes = array_map(function($n) {
                $tags = [];
                if (!empty($n['tags'])) {
                    $decoded = json_decode($n['tags'], true);
                    if (is_array($decoded)) $tags = $decoded;
                }
                return [
                    'id' => $n['id'],
                    'title' => $n['title'],
                    'content' => $n['content'],
                    'folderId' => $n['folder_id'],
                    'format' => $n['format'] ?? 'markdown',
                    'type' => $n['type'] ?? 'markdown',
                    'tags' => $tags,
                    'isStarred' => (bool)$n['is_starred'],
                    'isFavorite' => (bool)$n['is_favorite'],
                    'isShared' => (bool)$n['is_shared'],
                    'isDeleted' => (bool)$n['is_deleted'],
                    'createdAt' => $n['created_at'],
                    'updatedAt' => $n['updated_at'],
                ];
            }, $nStmt->fetchAll());
        }
        // 模式 3: merge (双向基于时间戳智能合并)
        else {
            // 获取云端现有数据
            $fStmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId");
            $fStmt->execute([':userId' => $userId]);
            $cloudFoldersRaw = $fStmt->fetchAll();
            $cloudFolderMap = [];
            foreach ($cloudFoldersRaw as $cf) {
                $cloudFolderMap[$cf['id']] = $cf;
            }

            $nStmt = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId");
            $nStmt->execute([':userId' => $userId]);
            $cloudNotesRaw = $nStmt->fetchAll();
            $cloudNoteMap = [];
            foreach ($cloudNotesRaw as $cn) {
                $cloudNoteMap[$cn['id']] = $cn;
            }

            // 合并文件夹
            $upsertFolder = $pdo->prepare("INSERT INTO folders (id, user_id, parent_id, name, order_num, is_collapsed, color, created_at, updated_at, is_deleted) 
                VALUES (:id, :userId, :parentId, :name, :orderNum, :isCollapsed, :color, :createdAt, :updatedAt, 0)
                ON DUPLICATE KEY UPDATE parent_id=:uParentId, name=:uName, order_num=:uOrderNum, is_collapsed=:uIsCollapsed, color=:uColor, updated_at=:uUpdatedAt");

            foreach ($clientFolders as $cf) {
                $id = $cf['id'];
                $shouldPush = false;
                if (!isset($cloudFolderMap[$id])) {
                    $shouldPush = true;
                } else {
                    $cloudTime = strtotime($cloudFolderMap[$id]['updated_at'] ?? '2000-01-01');
                    $localTime = strtotime($cf['updatedAt'] ?? '2000-01-01');
                    if ($localTime >= $cloudTime) {
                        $shouldPush = true;
                    }
                }

                if ($shouldPush) {
                    $upsertFolder->execute([
                        ':id' => $id,
                        ':userId' => $userId,
                        ':parentId' => $cf['parentId'] ?? null,
                        ':name' => $cf['name'] ?? '',
                        ':orderNum' => $cf['order'] ?? 0,
                        ':isCollapsed' => !empty($cf['isCollapsed']) ? 1 : 0,
                        ':color' => $cf['color'] ?? null,
                        ':createdAt' => $cf['createdAt'] ?? date('Y-m-d H:i:s'),
                        ':updatedAt' => $cf['updatedAt'] ?? date('Y-m-d H:i:s'),
                        ':uParentId' => $cf['parentId'] ?? null,
                        ':uName' => $cf['name'] ?? '',
                        ':uOrderNum' => $cf['order'] ?? 0,
                        ':uIsCollapsed' => !empty($cf['isCollapsed']) ? 1 : 0,
                        ':uColor' => $cf['color'] ?? null,
                        ':uUpdatedAt' => $cf['updatedAt'] ?? date('Y-m-d H:i:s'),
                    ]);
                }
            }

            // 合并笔记
            $upsertNote = $pdo->prepare("INSERT INTO notes (id, user_id, folder_id, title, content, format, type, tags, is_starred, is_favorite, is_shared, is_deleted, created_at, updated_at) 
                VALUES (:id, :userId, :folderId, :title, :content, :format, :type, :tags, :isStarred, :isFavorite, :isShared, :isDeleted, :createdAt, :updatedAt)
                ON DUPLICATE KEY UPDATE folder_id=:uFolderId, title=:uTitle, content=:uContent, format=:uFormat, type=:uType, tags=:uTags, is_starred=:uIsStarred, is_favorite=:uIsFavorite, is_shared=:uIsShared, is_deleted=:uIsDeleted, updated_at=:uUpdatedAt");

            foreach ($clientNotes as $cn) {
                $id = $cn['id'];
                $shouldPush = false;
                if (!isset($cloudNoteMap[$id])) {
                    $shouldPush = true;
                } else {
                    $cloudTime = strtotime($cloudNoteMap[$id]['updated_at'] ?? '2000-01-01');
                    $localTime = strtotime($cn['updatedAt'] ?? '2000-01-01');
                    if ($localTime >= $cloudTime) {
                        $shouldPush = true;
                    }
                }

                if ($shouldPush) {
                    $upsertNote->execute([
                        ':id' => $id,
                        ':userId' => $userId,
                        ':folderId' => $cn['folderId'] ?? '',
                        ':title' => $cn['title'] ?? '未命名笔记',
                        ':content' => $cn['content'] ?? '',
                        ':format' => $cn['format'] ?? 'markdown',
                        ':type' => $cn['type'] ?? 'markdown',
                        ':tags' => json_encode($cn['tags'] ?? [], JSON_UNESCAPED_UNICODE),
                        ':isStarred' => !empty($cn['isStarred']) ? 1 : 0,
                        ':isFavorite' => !empty($cn['isFavorite']) ? 1 : 0,
                        ':isShared' => !empty($cn['isShared']) ? 1 : 0,
                        ':isDeleted' => !empty($cn['isDeleted']) ? 1 : 0,
                        ':createdAt' => $cn['createdAt'] ?? date('Y-m-d H:i:s'),
                        ':updatedAt' => $cn['updatedAt'] ?? date('Y-m-d H:i:s'),
                        ':uFolderId' => $cn['folderId'] ?? '',
                        ':uTitle' => $cn['title'] ?? '未命名笔记',
                        ':uContent' => $cn['content'] ?? '',
                        ':uFormat' => $cn['format'] ?? 'markdown',
                        ':uType' => $cn['type'] ?? 'markdown',
                        ':uTags' => json_encode($cn['tags'] ?? [], JSON_UNESCAPED_UNICODE),
                        ':uIsStarred' => !empty($cn['isStarred']) ? 1 : 0,
                        ':uIsFavorite' => !empty($cn['isFavorite']) ? 1 : 0,
                        ':uIsShared' => !empty($cn['isShared']) ? 1 : 0,
                        ':uIsDeleted' => !empty($cn['isDeleted']) ? 1 : 0,
                        ':uUpdatedAt' => $cn['updatedAt'] ?? date('Y-m-d H:i:s'),
                    ]);
                }
            }

            // 查询合并后的最新完整结果
            $finalF = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId AND is_deleted = 0 ORDER BY order_num ASC");
            $finalF->execute([':userId' => $userId]);
            $mergedFolders = array_map(function($f) {
                return [
                    'id' => $f['id'],
                    'name' => $f['name'],
                    'parentId' => $f['parent_id'],
                    'order' => (int)$f['order_num'],
                    'isCollapsed' => (bool)$f['is_collapsed'],
                    'color' => $f['color'] ?? null,
                    'createdAt' => $f['created_at'],
                    'updatedAt' => $f['updated_at'],
                ];
            }, $finalF->fetchAll());

            $finalN = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId ORDER BY updated_at DESC");
            $finalN->execute([':userId' => $userId]);
            $mergedNotes = array_map(function($n) {
                $tags = [];
                if (!empty($n['tags'])) {
                    $decoded = json_decode($n['tags'], true);
                    if (is_array($decoded)) $tags = $decoded;
                }
                return [
                    'id' => $n['id'],
                    'title' => $n['title'],
                    'content' => $n['content'],
                    'folderId' => $n['folder_id'],
                    'format' => $n['format'] ?? 'markdown',
                    'type' => $n['type'] ?? 'markdown',
                    'tags' => $tags,
                    'isStarred' => (bool)$n['is_starred'],
                    'isFavorite' => (bool)$n['is_favorite'],
                    'isShared' => (bool)$n['is_shared'],
                    'isDeleted' => (bool)$n['is_deleted'],
                    'createdAt' => $n['created_at'],
                    'updatedAt' => $n['updated_at'],
                ];
            }, $finalN->fetchAll());
        }

        // 记录同步日志
        $logStmt = $pdo->prepare("INSERT INTO sync_logs (user_id, sync_mode, notes_count, folders_count, client_ip, user_agent) VALUES (:userId, :mode, :notesCount, :foldersCount, :ip, :ua)");
        $logStmt->execute([
            ':userId' => $userId,
            ':mode' => $mode,
            ':notesCount' => count($clientNotes),
            ':foldersCount' => count($clientFolders),
            ':ip' => $_SERVER['REMOTE_ADDR'] ?? '',
            ':ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250),
        ]);

        $pdo->commit();

        jsonResponse(200, true, '数据同步成功', [
            'notes' => $mergedNotes,
            'folders' => $mergedFolders,
            'mergedNotes' => $mergedNotes,
            'mergedFolders' => $mergedFolders,
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse(500, false, '全量同步失败: ' . $e->getMessage());
    }
}

// 默认兜底响应
jsonResponse(404, false, '未匹配到对应的 API 路由，请检查请求路径或参数');
