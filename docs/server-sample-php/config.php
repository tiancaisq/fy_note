<?php
/**
 * 枫叶云笔记 (Fengye Cloud Notes) - PHP 服务端配置文件
 */

return [
    // 数据库连接配置 (支持环境变量读取，优先适应 Docker Compose 环境)
    'db' => [
        'host'     => getenv('DB_HOST') ?: '127.0.0.1',
        'port'     => (int)(getenv('DB_PORT') ?: 3306),
        'dbname'   => getenv('DB_NAME') ?: 'fengye_notes',
        'username' => getenv('DB_USER') ?: 'root',
        'password' => getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : 'root',
        'charset'  => getenv('DB_CHARSET') ?: 'utf8mb4',
    ],

    // 安全与认证配置
    'auth' => [
        // 是否开启 API Token 校验（生产环境强烈建议开启）
        'enable_token' => getenv('ENABLE_TOKEN') ? filter_var(getenv('ENABLE_TOKEN'), FILTER_VALIDATE_BOOLEAN) : false,
        // 当开启时合法的 Token 列表或密钥
        'secret_token' => getenv('SECRET_TOKEN') ?: 'my_secret_token_123',
    ],

    // CORS 跨域配置
    'cors' => [
        'allowed_origins' => ['*'],
        'allowed_methods' => 'GET, POST, PUT, DELETE, OPTIONS',
        'allowed_headers' => 'Content-Type, Authorization, X-Requested-With, X-User-Id',
    ],
];
