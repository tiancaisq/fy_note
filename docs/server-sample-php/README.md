# 枫叶云笔记 PHP 服务端部署指南 (PHP Backend Guide)

本目录提供了一个轻量、单文件、无外部第三方依赖、开箱即用的 PHP RESTful 服务端实现，完全适配前端云端同步协议。

---

## 1. 快速启动（3 步完成）

### 第一步：导入数据库
创建并导入 MySQL 初始化脚本：
```bash
mysql -u root -p < ../init.sql
```
*(该脚本会自动创建 `fengye_notes` 数据库及 `folders`、`notes`、`sync_logs` 三张数据表并填充初始数据)*

### 第二步：修改数据库连接配置
编辑 `config.php` 文件，填入您的 MySQL 数据库账号密码：
```php
'db' => [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'dbname'   => 'fengye_notes',
    'username' => 'root',
    'password' => 'your_db_password',
    'charset'  => 'utf8mb4',
],
```

### 第三步：启动 PHP 内置服务器
在 `docs/server-sample-php/` 目录下执行：
```bash
php -S 0.0.0.0:8000
```

---

## 2. 在前端配置连接

1. 打开前端笔记应用，点击搜索框右侧的 **「未同步」** 或 **「云端已同步」** 徽章；
2. 切换到 **「服务器接口设置」** 标签；
3. 输入服务端 API 地址：
   ```
   http://localhost:8000/api.php
   ```
4. 点击 **「测试连接并保存」**，系统将自动验证接口连通性并扫描本地与云端的数据差异；
5. 点击 **「智能双向合并」**，即可将本地全部笔记与思维导图同步至您的私有 MySQL 云端！

---

## 3. Nginx 生产环境反向代理配置参考

```nginx
server {
    listen 80;
    server_name notes-api.yourdomain.com;
    root /path/to/docs/server-sample-php;
    index api.php index.php;

    location / {
        try_files $uri $uri/ /api.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```
