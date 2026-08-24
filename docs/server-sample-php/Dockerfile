FROM php:8.2-apache

# 安装 MySQL PDO 扩展
RUN docker-php-ext-install pdo pdo_mysql

# 开启 Apache rewrite 伪静态模块
RUN a2enmod rewrite

# 复制当前目录下的所有文件到容器 Web 根目录
COPY . /var/www/html/

# 设置 Web 目录权限
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
