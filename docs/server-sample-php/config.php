<?php
/**
 * 枫叶云笔记 (Fengye Cloud Notes) - PHP 服务端配置文件
 */

return [
    // 数据库连接配置
    'db' => [
        'host'     => '127.0.0.1',
        'port'     => 3306,
        'dbname'   => 'fengye_notes',
        'username' => 'root',
        'password' => 'root',
        'charset'  => 'utf8mb4',
    ],

    // 安全与认证配置
    'auth' => [
        // 是否开启 API Token 校验（生产环境强烈建议开启）
        'enable_token' => false,
        // 当开启时合法的 Token 列表或密钥
        'secret_token' => 'my_secret_token_123',
    ],

    // CORS 跨域配置
    'cors' => [
        'allowed_origins' => ['*'],
        'allowed_methods' => 'GET, POST, PUT, DELETE, OPTIONS',
        'allowed_headers' => 'Content-Type, Authorization, X-Requested-With, X-User-Id',
    ],
];
