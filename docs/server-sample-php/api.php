<?php
/**
 * ==============================================================================
 * 枫叶云笔记 (Fengye Cloud Notes) - 服务端标准 API
 * ==============================================================================
 * 
 * 运行环境要求:
 * - PHP 7.4+ 或 PHP 8.0+
 * - PDO 及 pdo_mysql 扩展开启
 * 
 * 接口调用规范:
 * 1. 采用显式 Query 参数路由模式 (?action=xxx)
 * 2. 身份标识: 请求头 `X-User-Id` 或 URL 参数 `userId` (未传默认 'default_user')
 * 3. 密钥认证: 请求头 `X-Api-Key` 或 `Authorization: Bearer <token>` (若开启认证)
 * 
 * 接口清单:
 * - GET    ?action=ping           服务健康检测与连通性验证
 * - GET    ?action=pull           全量获取云端笔记与文件夹数据
 * - POST   ?action=sync           全量/增量双向智能合并同步
 * - POST   ?action=upsert_note    新增或更新单篇笔记
 * - DELETE ?action=delete_note    删除单篇笔记
 * - POST   ?action=upsert_folder  新增或更新单个文件夹
 * - DELETE ?action=delete_folder  删除单个文件夹
 * ==============================================================================
 */

// 设置全局返回 JSON 格式
header('Content-Type: application/json; charset=utf-8');

// ==============================================================================
// 1. 加载配置与跨域 (CORS) 设置
// ==============================================================================
$configFile = __DIR__ . '/config.php';
$config = file_exists($configFile) ? require $configFile : [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'dbname' => 'fy_note',
        'username' => 'fy_note',
        'password' => '',
        'charset' => 'utf8mb4'
    ],
    'auth' => [
        'enable_token' => false,
        'secret_token' => 'my_secret_token_123'
    ]
];

// CORS 跨域响应头设置
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key');
header('Access-Control-Max-Age: 86400');

// 处理 OPTIONS 预检请求并直接返回
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ==============================================================================
// 2. 核心辅助函数定义
// ==============================================================================

/**
 * 统一 JSON 响应输出
 *
 * @param int $code HTTP 状态码 / 业务状态码
 * @param bool $success 是否成功
 * @param string $message 提示信息
 * @param mixed $data 返回数据负载
 */
function jsonResponse(int $code, bool $success, string $message, $data = null): void {
    http_response_code($code);
    echo json_encode([
        'code'        => $code,
        'success'     => $success,
        'message'     => $message,
        'data'        => $data,
        'serverTime'  => (int)(microtime(true) * 1000)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 校验请求的 HTTP Method 是否合法
 *
 * @param string|array $allowedMethods 允许的 HTTP 方法 (如 'GET' 或 ['POST', 'PUT'])
 */
function requireMethod($allowedMethods): void {
    $currentMethod = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $allowed = is_array($allowedMethods) ? array_map('strtoupper', $allowedMethods) : [strtoupper($allowedMethods)];
    
    if (!in_array($currentMethod, $allowed, true)) {
        jsonResponse(405, false, sprintf('请求方法错误: 当前接口仅支持 [%s]，收到的请求方法为 [%s]', implode(', ', $allowed), $currentMethod));
    }
}

// ==============================================================================
// 3. 数据库连接初始化 (PDO)
// ==============================================================================
try {
    $dbCfg = $config['db'];
    $dsn = "mysql:host={$dbCfg['host']};port={$dbCfg['port']};dbname={$dbCfg['dbname']};charset={$dbCfg['charset']}";
    $pdo = new PDO($dsn, $dbCfg['username'], $dbCfg['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    jsonResponse(500, false, '数据库连接失败: ' . $e->getMessage());
}

// ==============================================================================
// 4. 用户认证与租户隔离
// ==============================================================================

// 校验 API Token (如果配置中开启了认证)
if (!empty($config['auth']['enable_token'])) {
    $clientToken = $_SERVER['HTTP_X_API_KEY'] ?? '';
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $clientToken = trim($matches[1]);
    }
    
    $expectedToken = $config['auth']['secret_token'] ?? '';
    if (empty($clientToken) || $clientToken !== $expectedToken) {
        jsonResponse(401, false, '认证未通过: API Token 无效或未授权');
    }
}

// 提取当前用户唯一标识 (多用户数据隔离)
$userId = $_SERVER['HTTP_X_USER_ID'] ?? ($_GET['userId'] ?? 'default_user');

// 读取并解析请求体 JSON
$rawInput = file_get_contents('php://input');
$body = [];
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}

// ==============================================================================
// 5. 严格路由解析
// ==============================================================================

// 优先获取明确的 action 参数，未传时默认为 'ping' (健康检查)
$action = strtolower(trim((string)($_GET['action'] ?? $body['action'] ?? 'ping')));

// ==============================================================================
// 6. 路由分发 (Route Handlers)
// ==============================================================================
switch ($action) {

    // --------------------------------------------------------------------------
    // 接口 1: 健康检测 (Health / Ping)
    // --------------------------------------------------------------------------
    // 请求方式: GET
    // 说明: 用于客户端测试服务连通性及检测服务端环境版本
    // --------------------------------------------------------------------------
    case 'ping':
    case 'health':
        requireMethod('GET');
        jsonResponse(200, true, '枫叶云笔记服务端连接正常', [
            'service'     => 'fengye-cloud-notes-backend',
            'version'     => '2.1.0',
            'phpVersion'  => PHP_VERSION,
            'userId'      => $userId,
            'database'    => 'connected',
            'timestamp'   => (int)(microtime(true) * 1000)
        ]);
        break;

    // --------------------------------------------------------------------------
    // 接口 2: 获取全量云端数据 (Pull / Data)
    // --------------------------------------------------------------------------
    // 请求方式: GET
    // 说明: 全量拉取当前用户名下的所有文件夹与笔记列表
    // --------------------------------------------------------------------------
    case 'pull':
    case 'data':
        requireMethod('GET');
        try {
            // 查询所有有效文件夹 (按 order_num 排序)
            $folderStmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId AND is_deleted = 0 ORDER BY order_num ASC");
            $folderStmt->execute([':userId' => $userId]);
            $folders = array_map(function($f) {
                return [
                    'id'          => (string)$f['id'],
                    'name'        => (string)$f['name'],
                    'parentId'    => $f['parent_id'] ? (string)$f['parent_id'] : null,
                    'order'       => (int)($f['order_num'] ?? 0),
                    'isCollapsed' => (bool)($f['is_collapsed'] ?? false),
                    'color'       => $f['color'] ?? null,
                    'createdAt'   => $f['created_at'],
                    'updatedAt'   => $f['updated_at'],
                ];
            }, $folderStmt->fetchAll());

            // 查询所有笔记 (按 updated_at 倒序排列)
            $noteStmt = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId ORDER BY updated_at DESC");
            $noteStmt->execute([':userId' => $userId]);
            $notes = array_map(function($n) {
                $tags = [];
                if (!empty($n['tags'])) {
                    $decoded = json_decode($n['tags'], true);
                    if (is_array($decoded)) $tags = $decoded;
                }
                return [
                    'id'         => (string)$n['id'],
                    'title'      => (string)$n['title'],
                    'content'    => (string)($n['content'] ?? ''),
                    'folderId'   => $n['folder_id'] ? (string)$n['folder_id'] : '',
                    'format'     => (string)($n['format'] ?? 'markdown'),
                    'type'       => (string)($n['type'] ?? 'markdown'),
                    'tags'       => $tags,
                    'isStarred'  => (bool)($n['is_starred'] ?? false),
                    'isFavorite' => (bool)($n['is_favorite'] ?? false),
                    'isShared'   => (bool)($n['is_shared'] ?? false),
                    'isDeleted'  => (bool)($n['is_deleted'] ?? false),
                    'createdAt'  => $n['created_at'],
                    'updatedAt'  => $n['updated_at'],
                ];
            }, $noteStmt->fetchAll());

            jsonResponse(200, true, '全量云端数据获取成功', [
                'folders'      => $folders,
                'notes'        => $notes,
                'foldersCount' => count($folders),
                'notesCount'   => count($notes),
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '拉取云端数据失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 3: 单篇笔记保存 (Upsert Note)
    // --------------------------------------------------------------------------
    // 请求方式: POST
    // 请求体: { "note": { id, title, content, folderId, ... } } 或直接传入 note 对象
    // 说明: 单篇笔记的新建或即时自动保存更新
    // --------------------------------------------------------------------------
    case 'upsert_note':
    case 'save_note':
        requireMethod('POST');
        $note = !empty($body['note']) && is_array($body['note']) ? $body['note'] : $body;
        
        if (empty($note['id'])) {
            jsonResponse(400, false, '参数缺失: 缺少笔记唯一标识 (id)');
        }

        try {
            $id = (string)$note['id'];
            $folderId = !empty($note['folderId']) ? (string)$note['folderId'] : '';
            $title = (string)($note['title'] ?? '未命名笔记');
            $content = (string)($note['content'] ?? '');
            $format = (string)($note['format'] ?? 'markdown');
            $type = (string)($note['type'] ?? 'markdown');
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
                ':id'         => $id,
                ':userId'     => $userId,
                ':folderId'   => $folderId,
                ':title'      => $title,
                ':content'    => $content,
                ':format'     => $format,
                ':type'       => $type,
                ':tags'       => $tags,
                ':isStarred'  => $isStarred,
                ':isFavorite' => $isFavorite,
                ':isShared'   => $isShared,
                ':isDeleted'  => $isDeleted,
                ':createdAt'  => $createdAt,
                ':updatedAt'  => $updatedAt,
                ':uFolderId'  => $folderId,
                ':uTitle'     => $title,
                ':uContent'   => $content,
                ':uFormat'    => $format,
                ':uType'      => $type,
                ':uTags'      => $tags,
                ':uIsStarred' => $isStarred,
                ':uIsFavorite'=> $isFavorite,
                ':uIsShared'  => $isShared,
                ':uIsDeleted' => $isDeleted,
                ':uUpdatedAt' => $updatedAt,
            ]);

            jsonResponse(200, true, '笔记已成功同步至云端', [
                'id'        => $id,
                'updatedAt' => $updatedAt
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '保存笔记失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 4: 单篇笔记删除 (Delete Note)
    // --------------------------------------------------------------------------
    // 请求方式: POST 或 DELETE 或 GET
    // 参数: id (Query 参数或 Request Body)
    // 说明: 从云端数据库彻底移除指定笔记
    // --------------------------------------------------------------------------
    case 'delete_note':
        $noteId = (string)($_GET['id'] ?? $body['id'] ?? '');
        if (empty($noteId)) {
            jsonResponse(400, false, '参数缺失: 缺少待删除的笔记 ID');
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM notes WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $noteId, ':userId' => $userId]);

            jsonResponse(200, true, '云端笔记已删除', [
                'id'      => $noteId,
                'deleted' => true
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '删除笔记失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 5: 单个文件夹保存 (Upsert Folder)
    // --------------------------------------------------------------------------
    // 请求方式: POST
    // 请求体: { "folder": { id, name, parentId, ... } } 或直接传入 folder 对象
    // 说明: 文件夹的创建、重命名、移动或折叠状态同步
    // --------------------------------------------------------------------------
    case 'upsert_folder':
    case 'save_folder':
        requireMethod('POST');
        $folder = !empty($body['folder']) && is_array($body['folder']) ? $body['folder'] : $body;
        
        if (empty($folder['id'])) {
            jsonResponse(400, false, '参数缺失: 缺少文件夹唯一标识 (id)');
        }

        try {
            $id = (string)$folder['id'];
            $parentId = !empty($folder['parentId']) ? (string)$folder['parentId'] : null;
            $name = (string)($folder['name'] ?? '未命名文件夹');
            $orderNum = (int)($folder['order'] ?? 0);
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
                ':id'          => $id,
                ':userId'      => $userId,
                ':parentId'    => $parentId,
                ':name'        => $name,
                ':orderNum'    => $orderNum,
                ':isCollapsed' => $isCollapsed,
                ':color'       => $color,
                ':createdAt'   => $createdAt,
                ':updatedAt'   => $updatedAt,
                ':uParentId'   => $parentId,
                ':uName'       => $name,
                ':uOrderNum'   => $orderNum,
                ':uIsCollapsed'=> $isCollapsed,
                ':uColor'      => $color,
                ':uUpdatedAt'  => $updatedAt,
            ]);

            jsonResponse(200, true, '文件夹已成功同步至云端', [
                'id'        => $id,
                'updatedAt' => $updatedAt
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '保存文件夹失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 6: 单个文件夹删除 (Delete Folder)
    // --------------------------------------------------------------------------
    // 请求方式: POST 或 DELETE 或 GET
    // 参数: id (Query 参数或 Request Body)
    // 说明: 从云端数据库彻底移除指定文件夹
    // --------------------------------------------------------------------------
    case 'delete_folder':
        $folderId = (string)($_GET['id'] ?? $body['id'] ?? '');
        if (empty($folderId)) {
            jsonResponse(400, false, '参数缺失: 缺少待删除的文件夹 ID');
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM folders WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $folderId, ':userId' => $userId]);

            jsonResponse(200, true, '云端文件夹已删除', [
                'id'      => $folderId,
                'deleted' => true
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '删除文件夹失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 7: 清空回收站 / 彻底删除回收站笔记 (Empty Trash)
    // --------------------------------------------------------------------------
    // 请求方式: POST 或 DELETE 或 GET
    // 请求体: { "noteIds": [...] } (可选指定待彻底删除的回收站笔记ID列表，未传则清理该用户云端所有 is_deleted=1 的笔记)
    // 说明: 彻底从云端物理删除回收站内的笔记数据
    // --------------------------------------------------------------------------
    case 'empty_trash':
    case 'clear_trash':
        $targetNoteIds = is_array($body['noteIds'] ?? null) ? $body['noteIds'] : [];
        if (empty($targetNoteIds) && !empty($_GET['ids'])) {
            $targetNoteIds = explode(',', (string)$_GET['ids']);
        }

        try {
            if (!empty($targetNoteIds)) {
                $placeholders = implode(',', array_fill(0, count($targetNoteIds), '?'));
                $stmt = $pdo->prepare("DELETE FROM notes WHERE user_id = ? AND id IN ($placeholders)");
                $stmt->execute(array_merge([$userId], $targetNoteIds));
                $deletedCount = $stmt->rowCount();
            } else {
                $stmt = $pdo->prepare("DELETE FROM notes WHERE user_id = :userId AND is_deleted = 1");
                $stmt->execute([':userId' => $userId]);
                $deletedCount = $stmt->rowCount();
            }

            jsonResponse(200, true, '云端回收站已清空', [
                'deletedCount' => $deletedCount
            ]);
        } catch (Exception $e) {
            jsonResponse(500, false, '清空云端回收站失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 接口 8: 双向智能合并同步 (Batch Merge Sync)
    // --------------------------------------------------------------------------
    // 请求方式: POST
    // 请求体: { "notes": [...], "folders": [...], "deletedNoteIds": [...], "deletedFolderIds": [...] }
    // 说明: 客户端批量提交本地数据，按更新时间戳执行安全双向无损合并，并同步物理删除已废弃的笔记与文件夹
    // --------------------------------------------------------------------------
    case 'sync':
    case 'merge':
        requireMethod('POST');
        $clientNotes = is_array($body['notes'] ?? null) ? $body['notes'] : [];
        $clientFolders = is_array($body['folders'] ?? null) ? $body['folders'] : [];
        $deletedNoteIds = is_array($body['deletedNoteIds'] ?? null) ? $body['deletedNoteIds'] : [];
        $deletedFolderIds = is_array($body['deletedFolderIds'] ?? null) ? $body['deletedFolderIds'] : [];

        try {
            $pdo->beginTransaction();

            // 0. 先处理彻底删除项（如清空回收站或彻底删除文件夹）
            if (!empty($deletedNoteIds)) {
                $placeholders = implode(',', array_fill(0, count($deletedNoteIds), '?'));
                $delStmt = $pdo->prepare("DELETE FROM notes WHERE user_id = ? AND id IN ($placeholders)");
                $delStmt->execute(array_merge([$userId], $deletedNoteIds));
            }
            if (!empty($deletedFolderIds)) {
                $placeholders = implode(',', array_fill(0, count($deletedFolderIds), '?'));
                $delStmt = $pdo->prepare("DELETE FROM folders WHERE user_id = ? AND id IN ($placeholders)");
                $delStmt->execute(array_merge([$userId], $deletedFolderIds));
            }

            // 1. 查询云端现有文件夹索引
            $fStmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId");
            $fStmt->execute([':userId' => $userId]);
            $cloudFoldersRaw = $fStmt->fetchAll();
            $cloudFolderMap = [];
            foreach ($cloudFoldersRaw as $cf) {
                $cloudFolderMap[$cf['id']] = $cf;
            }

            // 2. 查询云端现有笔记索引
            $nStmt = $pdo->prepare("SELECT * FROM notes WHERE user_id = :userId");
            $nStmt->execute([':userId' => $userId]);
            $cloudNotesRaw = $nStmt->fetchAll();
            $cloudNoteMap = [];
            foreach ($cloudNotesRaw as $cn) {
                $cloudNoteMap[$cn['id']] = $cn;
            }

            // 3. 执行文件夹双向比对与更新 (仅在本地时间戳 >= 云端时间戳或云端不存在时更新)
            $upsertFolder = $pdo->prepare("INSERT INTO folders 
                (id, user_id, parent_id, name, order_num, is_collapsed, color, created_at, updated_at, is_deleted) 
                VALUES (:id, :userId, :parentId, :name, :orderNum, :isCollapsed, :color, :createdAt, :updatedAt, 0)
                ON DUPLICATE KEY UPDATE 
                    parent_id = :uParentId, 
                    name = :uName, 
                    order_num = :uOrderNum, 
                    is_collapsed = :uIsCollapsed, 
                    color = :uColor, 
                    updated_at = :uUpdatedAt");

            foreach ($clientFolders as $cf) {
                $fid = (string)$cf['id'];
                $shouldUpdate = false;
                
                if (!isset($cloudFolderMap[$fid])) {
                    $shouldUpdate = true;
                } else {
                    $cloudTs = strtotime($cloudFolderMap[$fid]['updated_at'] ?? '2000-01-01');
                    $localTs = strtotime($cf['updatedAt'] ?? '2000-01-01');
                    if ($localTs >= $cloudTs) {
                        $shouldUpdate = true;
                    }
                }

                if ($shouldUpdate) {
                    $upsertFolder->execute([
                        ':id'          => $fid,
                        ':userId'      => $userId,
                        ':parentId'    => !empty($cf['parentId']) ? (string)$cf['parentId'] : null,
                        ':name'        => (string)($cf['name'] ?? ''),
                        ':orderNum'    => (int)($cf['order'] ?? 0),
                        ':isCollapsed' => !empty($cf['isCollapsed']) ? 1 : 0,
                        ':color'       => $cf['color'] ?? null,
                        ':createdAt'   => $cf['createdAt'] ?? date('Y-m-d H:i:s'),
                        ':updatedAt'   => $cf['updatedAt'] ?? date('Y-m-d H:i:s'),
                        ':uParentId'   => !empty($cf['parentId']) ? (string)$cf['parentId'] : null,
                        ':uName'       => (string)($cf['name'] ?? ''),
                        ':uOrderNum'   => (int)($cf['order'] ?? 0),
                        ':uIsCollapsed'=> !empty($cf['isCollapsed']) ? 1 : 0,
                        ':uColor'      => $cf['color'] ?? null,
                        ':uUpdatedAt'  => $cf['updatedAt'] ?? date('Y-m-d H:i:s'),
                    ]);
                }
            }

            // 4. 执行笔记双向比对与更新 (仅在本地时间戳 >= 云端时间戳或云端不存在时更新)
            $upsertNote = $pdo->prepare("INSERT INTO notes 
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

            foreach ($clientNotes as $cn) {
                $nid = (string)$cn['id'];
                $shouldUpdate = false;

                if (!isset($cloudNoteMap[$nid])) {
                    $shouldUpdate = true;
                } else {
                    $cloudTs = strtotime($cloudNoteMap[$nid]['updated_at'] ?? '2000-01-01');
                    $localTs = strtotime($cn['updatedAt'] ?? '2000-01-01');
                    if ($localTs >= $cloudTs) {
                        $shouldUpdate = true;
                    }
                }

                if ($shouldUpdate) {
                    $upsertNote->execute([
                        ':id'         => $nid,
                        ':userId'     => $userId,
                        ':folderId'   => !empty($cn['folderId']) ? (string)$cn['folderId'] : '',
                        ':title'      => (string)($cn['title'] ?? '未命名笔记'),
                        ':content'    => (string)($cn['content'] ?? ''),
                        ':format'     => (string)($cn['format'] ?? 'markdown'),
                        ':type'       => (string)($cn['type'] ?? 'markdown'),
                        ':tags'       => json_encode($cn['tags'] ?? [], JSON_UNESCAPED_UNICODE),
                        ':isStarred'  => !empty($cn['isStarred']) ? 1 : 0,
                        ':isFavorite' => !empty($cn['isFavorite']) ? 1 : 0,
                        ':isShared'   => !empty($cn['isShared']) ? 1 : 0,
                        ':isDeleted'  => !empty($cn['isDeleted']) ? 1 : 0,
                        ':createdAt'  => $cn['createdAt'] ?? date('Y-m-d H:i:s'),
                        ':updatedAt'  => $cn['updatedAt'] ?? date('Y-m-d H:i:s'),
                        ':uFolderId'  => !empty($cn['folderId']) ? (string)$cn['folderId'] : '',
                        ':uTitle'     => (string)($cn['title'] ?? '未命名笔记'),
                        ':uContent'   => (string)($cn['content'] ?? ''),
                        ':uFormat'    => (string)($cn['format'] ?? 'markdown'),
                        ':uType'      => (string)($cn['type'] ?? 'markdown'),
                        ':uTags'      => json_encode($cn['tags'] ?? [], JSON_UNESCAPED_UNICODE),
                        ':uIsStarred' => !empty($cn['isStarred']) ? 1 : 0,
                        ':uIsFavorite'=> !empty($cn['isFavorite']) ? 1 : 0,
                        ':uIsShared'  => !empty($cn['isShared']) ? 1 : 0,
                        ':uIsDeleted' => !empty($cn['isDeleted']) ? 1 : 0,
                        ':uUpdatedAt' => $cn['updatedAt'] ?? date('Y-m-d H:i:s'),
                    ]);
                }
            }

            // 查询合并后的最新完整数据并返回给客户端
            $finalF = $pdo->prepare("SELECT * FROM folders WHERE user_id = :userId AND is_deleted = 0 ORDER BY order_num ASC");
            $finalF->execute([':userId' => $userId]);
            $mergedFolders = array_map(function($f) {
                return [
                    'id'          => (string)$f['id'],
                    'name'        => (string)$f['name'],
                    'parentId'    => $f['parent_id'] ? (string)$f['parent_id'] : null,
                    'order'       => (int)($f['order_num'] ?? 0),
                    'isCollapsed' => (bool)($f['is_collapsed'] ?? false),
                    'color'       => $f['color'] ?? null,
                    'createdAt'   => $f['created_at'],
                    'updatedAt'   => $f['updated_at'],
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
                    'id'         => (string)$n['id'],
                    'title'      => (string)$n['title'],
                    'content'    => (string)($n['content'] ?? ''),
                    'folderId'   => $n['folder_id'] ? (string)$n['folder_id'] : '',
                    'format'     => (string)($n['format'] ?? 'markdown'),
                    'type'       => (string)($n['type'] ?? 'markdown'),
                    'tags'       => $tags,
                    'isStarred'  => (bool)($n['is_starred'] ?? false),
                    'isFavorite' => (bool)($n['is_favorite'] ?? false),
                    'isShared'   => (bool)($n['is_shared'] ?? false),
                    'isDeleted'  => (bool)($n['is_deleted'] ?? false),
                    'createdAt'  => $n['created_at'],
                    'updatedAt'  => $n['updated_at'],
                ];
            }, $finalN->fetchAll());

            $pdo->commit();

            jsonResponse(200, true, '数据同步成功', [
                'folders'      => $mergedFolders,
                'notes'        => $mergedNotes,
                'foldersCount' => count($mergedFolders),
                'notesCount'   => count($mergedNotes),
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            jsonResponse(500, false, '全量同步失败: ' . $e->getMessage());
        }
        break;

    // --------------------------------------------------------------------------
    // 默认兜底: 未匹配到已知 Action
    // --------------------------------------------------------------------------
    default:
        jsonResponse(400, false, sprintf('无效的 action 参数: [%s]。请参考 API 文档传入正确的操作指令 (ping / pull / sync / upsert_note / delete_note / empty_trash / upsert_folder / delete_folder)', htmlspecialchars($action, ENT_QUOTES, 'UTF-8')));
        break;
}
