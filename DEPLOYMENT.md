# 部署说明

本文档说明如何把家庭朋友聚餐点菜系统部署到一台轻量服务器上。

推荐部署方式：

```text
Nginx 静态托管前端
Nginx 反向代理 /api 和 /uploads 到后端
Node.js 运行后端 API
SQLite 保存数据
uploads 保存菜品图片
PM2 管理后端进程
```

## 1. 服务器要求

最低配置：

```text
1 核 CPU
1GB 内存
10GB 磁盘
Linux 服务器，推荐 Ubuntu 22.04 / 24.04
```

需要安装：

```text
Node.js 20 或 22 LTS
npm
Nginx
PM2
Git，可选
```

当前开发机 Node.js 是 24，也能运行。生产环境更推荐 Node.js LTS。

## 2. 目录规划

推荐部署目录：

```text
/opt/dinner-order
```

关键持久化目录：

```text
/opt/dinner-order/data/app.db
/opt/dinner-order/uploads/
```

必须重点备份：

```text
data/app.db
uploads/
```

## 3. 上传项目

方式一：直接复制项目目录到服务器：

```bash
scp -r dinner-order root@your-server:/opt/dinner-order
```

方式二：如果后续接 Git，可以在服务器拉取：

```bash
cd /opt
git clone your-repo-url dinner-order
```

进入项目：

```bash
cd /opt/dinner-order
```

## 4. 安装依赖

国内服务器建议使用镜像源：

```bash
npm install --registry=https://registry.npmmirror.com
```

普通网络环境：

```bash
npm install
```

## 5. 配置环境变量

复制环境变量文件：

```bash
cp .env.example .env
```

编辑：

```bash
nano .env
```

推荐内容：

```env
DATABASE_URL="file:../data/app.db"
JWT_SECRET="请改成一串足够长的随机字符串"
PORT=8787
```

生成随机密钥示例：

```bash
openssl rand -hex 32
```

注意：

- `JWT_SECRET` 部署前必须修改。
- `DATABASE_URL` 保持 `file:../data/app.db` 即可。

## 6. 初始化数据库

确保目录存在：

```bash
mkdir -p data uploads/dishes
```

同步数据库结构：

```bash
npm run db:push
```

写入默认账号和示例数据：

```bash
npm run db:seed
```

注意：
`npm run db:seed` 适合首次部署初始化使用，不建议在已经有正式菜品数据的服务器上作为日常更新步骤反复执行。

默认后台账号：

```text
用户名：admin
密码：admin123456
```

部署后建议尽快修改默认密码。目前系统还没有后台改密码页面，可以先通过 seed 或数据库脚本修改。

## 7. 构建项目

```bash
npm run build
```

构建产物：

```text
前端：apps/web/dist
后端：apps/server/dist
```

如果只构建前端：

```bash
npm run build --workspace @dinner-order/web
```

如果只构建后端：

```bash
npm run build --workspace @dinner-order/server
```

## 8. 启动后端

### 方式一：直接启动

```bash
npm run start --workspace @dinner-order/server
```

后端默认监听：

```text
http://127.0.0.1:8787
```

### 方式二：PM2 启动，推荐

安装 PM2：

```bash
npm install -g pm2
```

从项目根目录启动：

```bash
cd /opt/dinner-order
pm2 start npm --name dinner-order-api -- run start --workspace @dinner-order/server
```

查看状态：

```bash
pm2 status
```

查看日志：

```bash
pm2 logs dinner-order-api
```

设置开机自启：

```bash
pm2 save
pm2 startup
```

执行 `pm2 startup` 后，终端会输出一条需要复制执行的命令，按提示执行即可。

## 9. 配置 Nginx

假设域名：

```text
dinner.example.com
```

创建 Nginx 配置：

```bash
nano /etc/nginx/sites-available/dinner-order
```

写入：

```nginx
server {
    listen 80;
    server_name dinner.example.com;

    root /opt/dinner-order/apps/web/dist;
    index index.html;

    client_max_body_size 10m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8787/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
ln -s /etc/nginx/sites-available/dinner-order /etc/nginx/sites-enabled/dinner-order
```

测试配置：

```bash
nginx -t
```

重载 Nginx：

```bash
systemctl reload nginx
```

访问：

```text
http://dinner.example.com/admin
http://dinner.example.com/e/family-demo
```

## 10. 配置 HTTPS

推荐使用 Certbot。

安装：

```bash
apt update
apt install -y certbot python3-certbot-nginx
```

签发证书：

```bash
certbot --nginx -d dinner.example.com
```

测试自动续期：

```bash
certbot renew --dry-run
```

## 11. 本地局域网部署

如果只是家里或朋友聚餐临时使用，也可以不配置域名。

服务器启动后，查看局域网 IP：

```bash
ip addr
```

例如服务器 IP：

```text
192.168.3.100
```

访问：

```text
http://192.168.3.100/admin
http://192.168.3.100/e/family-demo
```

这种方式适合：

- 家用 NAS
- 迷你主机
- 树莓派
- 局域网临时聚餐

## 12. 数据备份

建议创建备份目录：

```bash
mkdir -p /opt/backups/dinner-order
```

手动备份：

```bash
cd /opt/dinner-order
tar -czf /opt/backups/dinner-order/dinner-order-$(date +%F-%H%M%S).tar.gz data uploads
```

恢复：

```bash
cd /opt/dinner-order
tar -xzf /opt/backups/dinner-order/备份文件.tar.gz
pm2 restart dinner-order-api
```

## 13. 定时备份

编辑 crontab：

```bash
crontab -e
```

每天凌晨 3 点备份：

```cron
0 3 * * * cd /opt/dinner-order && tar -czf /opt/backups/dinner-order/dinner-order-$(date +\%F-\%H\%M\%S).tar.gz data uploads
```

建议再定期清理老备份，例如保留 30 天：

```cron
30 3 * * * find /opt/backups/dinner-order -name "*.tar.gz" -mtime +30 -delete
```

## 14. 升级流程

升级前先备份：

```bash
cd /opt/dinner-order
tar -czf /opt/backups/dinner-order/before-upgrade-$(date +%F-%H%M%S).tar.gz data uploads
```

更新代码后：

```bash
npm install --registry=https://registry.npmmirror.com
npm run db:push
npm run build
pm2 restart dinner-order-api
systemctl reload nginx
```

如果升级失败，可以恢复备份。

### 14.1 代码更新后，服务器需要执行什么

如果服务器可以正常访问 GitHub，推荐使用下面这套标准流程：

```bash
cd /opt/dinner-order
tar -czf /opt/backups/dinner-order/before-update-$(date +%F-%H%M%S).tar.gz data uploads
git pull
npm install --registry=https://registry.npmmirror.com
npm run db:push
npm run build
pm2 restart dinner-order-api
systemctl reload nginx
```

执行完成后建议检查：

```bash
pm2 status
curl http://127.0.0.1:8787/health
curl -I http://127.0.0.1
```

如果服务器网络不稳定，`git pull` 经常卡住，可以改成本地更新代码后再上传服务器。推荐流程：

1. 本地先拉最新代码并确认修改完成。
2. 上传代码到服务器，保留服务器上的 `data/` 和 `uploads/`。
3. 服务器执行下面命令完成更新：

```bash
cd /opt/dinner-order
git pull origin main
npm install --registry=https://registry.npmmirror.com
npm run db:push
npm run build
pm2 restart dinner-order-api
systemctl reload nginx
```

上面这套是正式环境日常更新的推荐流程，默认不要执行 `npm run db:seed`，避免覆盖或改动服务器上已经在后台维护过的菜品、分类、演示活动等数据。

只有以下两类场景才建议执行 `npm run db:seed`：

1. 首次部署，数据库还是空的，需要初始化管理员和基础演示数据
2. 你明确知道这次更新需要执行初始化数据脚本，并且确认不会影响线上已有业务数据

如果后续需要做“分类更名、演示数据修正、历史数据迁移”这类动作，建议单独编写一次性迁移脚本，不要继续把它放进日常 `db:seed` 流程。

如果这是首次部署，或你明确要初始化空数据库，可以额外执行：

```bash
npm run db:seed
```

`npm run db:push` 只负责同步数据库结构，不会帮你初始化演示数据或管理员账号。

如果这次更新只改了前端页面，没有改后端和数据库，最少可以执行：

```bash
cd /opt/dinner-order
npm run build --workspace @dinner-order/web
systemctl reload nginx
```

如果这次更新改了后端接口，但没有改数据库结构，最少执行：

```bash
cd /opt/dinner-order
npm run build
pm2 restart dinner-order-api
systemctl reload nginx
```

如果不确定这次代码更新是否会影响线上已有数据，优先使用“不执行 `db:seed`”的日常更新流程；只有在确认是首次初始化或明确需要数据初始化时，再单独补执行 `npm run db:seed`：

```bash
cd /opt/dinner-order
git pull origin main
npm install --registry=https://registry.npmmirror.com
npm run db:push
npm run build
pm2 restart dinner-order-api
systemctl reload nginx
```

如果不确定这次改动影响范围，默认执行完整流程最稳。

## 15. 常用运维命令

查看后端状态：

```bash
pm2 status
```

查看后端日志：

```bash
pm2 logs dinner-order-api
```

重启后端：

```bash
pm2 restart dinner-order-api
```

查看端口：

```bash
ss -lntp | grep 8787
```

检查 API：

```bash
curl http://127.0.0.1:8787/health
```

检查前端：

```bash
curl -I http://127.0.0.1
```

## 16. 文件权限

确保 Node 进程对以下目录有写权限：

```text
/opt/dinner-order/data
/opt/dinner-order/uploads
```

如果使用 `www-data` 或其他用户运行：

```bash
chown -R www-data:www-data /opt/dinner-order/data /opt/dinner-order/uploads
```

如果使用当前登录用户运行 PM2，则保证当前用户有权限即可。

## 17. 故障排查

### 后台打不开

检查：

```bash
nginx -t
systemctl status nginx
pm2 status
```

### API 不通

检查：

```bash
curl http://127.0.0.1:8787/health
pm2 logs dinner-order-api
```

### 图片上传失败

检查：

```bash
ls -ld /opt/dinner-order/uploads
ls -ld /opt/dinner-order/uploads/dishes
```

确认 Nginx 配置中有：

```nginx
client_max_body_size 10m;
```

### 数据库无法写入

检查：

```bash
ls -ld /opt/dinner-order/data
ls -l /opt/dinner-order/data/app.db
```

确认运行后端的用户有写权限。

### 前端刷新后 404

确认 Nginx 有：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

这是 Vue Router history 模式必须的配置。

## 18. 生产环境建议

上线前建议完成：

- 修改 `JWT_SECRET`
- 修改默认后台密码
- 配置 HTTPS
- 配置定时备份
- 限制服务器安全组，只开放 80/443
- 不直接暴露 8787 端口到公网
- 定期备份 `data` 和 `uploads`

## 19. 最小部署检查清单

上线前确认：

```text
[ ] npm install 已完成
[ ] .env 已配置
[ ] JWT_SECRET 已修改
[ ] npm run db:push 已执行
[ ] 如为首次部署或明确需要初始化数据：`npm run db:seed` 已执行
[ ] npm run build 已成功
[ ] PM2 后端已启动
[ ] Nginx 已配置
[ ] /admin 可访问
[ ] /e/family-demo 可访问
[ ] 图片上传可用
[ ] data/app.db 已纳入备份
[ ] uploads 已纳入备份
```
