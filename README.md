# Dinner Order

适用于家庭、朋友聚餐的轻量点菜 H5 + 后台管理系统。

## 技术栈

- 前端：Vue 3 + Vite + Vant + Element Plus
- 后端：Hono + Prisma + SQLite
- 部署：单 Node 服务或 Docker/PM2

## 本地启动

```bash
npm install
Copy-Item .env.example .env
npm run db:push
npm run db:seed
npm run dev:server
npm run dev:web
```

默认后台账号：

- 用户名：admin
- 密码：admin123456

示例点菜链接：

- http://localhost:5173/e/family-demo

后台：

- http://localhost:5173/admin

## 目录

```text
apps/server  Hono API
apps/web     Vue H5 与后台
prisma       数据模型与种子数据
data         SQLite 数据文件
uploads      菜品图片目录
```
