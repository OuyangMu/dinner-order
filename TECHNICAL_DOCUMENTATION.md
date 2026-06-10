# 家庭朋友聚餐点菜系统技术文档

## 1. 项目概述

本项目是一个适用于家庭、朋友聚餐场景的轻量点菜系统，包含前台 H5 点菜页面和后台管理系统。

系统不包含支付、会员、营销等商业餐饮功能，重点解决：

- 聚餐活动管理
- 扫码点菜
- 菜品管理
- 图片上传
- 订单管理
- 菜品备菜汇总
- 食材备菜汇总
- 历史活动保留与复用

项目路径：

```text
D:\oooooymCodeX\dinner-order
```

本地访问地址：

```text
前台点菜页：http://localhost:5173/e/family-demo
后台管理页：http://localhost:5173/admin
后端 API：http://localhost:8787
```

默认后台账号：

```text
用户名：admin
密码：admin123456
```

## 2. 技术栈

### 前端

- Vue 3
- Vite
- TypeScript
- Vue Router
- Vant
- Element Plus
- lucide-vue-next

### 后端

- Node.js
- TypeScript
- Hono
- Prisma
- SQLite
- bcryptjs
- qrcode
- zod

### 存储

- SQLite 数据库：`data/app.db`
- 本地上传图片：`uploads/dishes`

## 3. 项目结构

```text
dinner-order/
  apps/
    server/
      src/
        index.ts
      package.json
      tsconfig.json
    web/
      src/
        api.ts
        App.vue
        main.ts
        style.css
        pages/
          AdminHome.vue
          GuestMenu.vue
      index.html
      package.json
      tsconfig.json
      vite.config.ts
  prisma/
    schema.prisma
    seed.ts
  data/
    app.db
  uploads/
    dishes/
  package.json
  README.md
  TECHNICAL_DOCUMENTATION.md
```

## 4. 启动方式

首次启动：

```bash
cd D:\oooooymCodeX\dinner-order
npm.cmd install --registry=https://registry.npmmirror.com
Copy-Item .env.example .env
npm.cmd run db:push
npm.cmd run db:seed
```

开发启动：

```bash
npm.cmd run dev:server
npm.cmd run dev:web
```

构建验证：

```bash
npm.cmd run build
```

单独构建：

```bash
npm.cmd run build --workspace @dinner-order/server
npm.cmd run build --workspace @dinner-order/web
```

## 5. 环境变量

`.env`：

```env
DATABASE_URL="file:../data/app.db"
JWT_SECRET="change-me-before-deploy"
PORT=8787
```

说明：

- `DATABASE_URL`：SQLite 数据库路径。由于 Prisma schema 位于 `prisma/` 目录，所以这里使用 `../data/app.db`。
- `JWT_SECRET`：后台登录 token 签名密钥，部署前必须修改。
- `PORT`：后端服务端口，默认 `8787`。

## 6. 数据模型

核心模型定义位于：

```text
prisma/schema.prisma
```

### Admin

后台管理员。

主要字段：

- `username`
- `passwordHash`
- `role`

### Event

聚餐活动。一次聚餐对应一个活动。

主要字段：

- `title`：活动名称
- `description`：说明
- `dateTime`：聚餐时间
- `status`：活动状态
- `accessCode`：前台访问短码
- `allowModify`：是否允许修改
- `showSummary`：前台是否显示大家已点

状态：

```text
DRAFT   草稿
OPEN    开放点菜
CLOSED  已关闭
```

### Category

菜品分类。

主要字段：

- `name`
- `sortOrder`
- `enabled`

### Dish

菜品主数据。

主要字段：

- `name`
- `categoryId`
- `imageUrl`
- `description`
- `tags`
- `prepItems`
- `servingHint`
- `enabled`
- `stockLimit`
- `sortOrder`

说明：

- `tags` 使用 JSON 字符串存储。
- `prepItems` 使用 JSON 字符串存储每份菜所需食材。

`prepItems` 示例：

```json
[
  { "name": "鸡腿肉", "quantity": 300, "unit": "g" },
  { "name": "花生", "quantity": 40, "unit": "g" }
]
```

### EventDish

活动菜单表，用于表示某个活动包含哪些菜品。

主要字段：

- `eventId`
- `dishId`
- `enabled`
- `stockLimit`
- `sortOrder`

说明：

- 新建活动时，如果不选择复制历史菜单，默认会把所有启用菜品加入活动。
- 后台可以手动把菜品加入或移出当前活动。

### Order

订单。

主要字段：

- `eventId`
- `guestName`
- `guestToken`
- `note`
- `status`

状态：

```text
SUBMITTED
CONFIRMED
CANCELED
```

### OrderItem

订单明细。

主要字段：

- `orderId`
- `dishId`
- `quantity`
- `note`
- `prepStatus`

备菜状态：

```text
TODO
DOING
DONE
```

## 7. 前台功能

前台页面：

```text
apps/web/src/pages/GuestMenu.vue
```

访问路径：

```text
/e/:accessCode
```

### 已实现功能

- 根据活动短码加载菜单
- 分类展示菜品
- 点击左侧分类平滑滚动到对应菜品模块
- 滚动时同步左侧分类高亮
- 菜品加减数量
- 点菜单弹窗
- 昵称必填
- 整单备注
- 单项菜品备注
- 提交订单
- 显示大家已点
- 展示谁点了什么菜
- 点击菜品图片或菜品名称查看大图

### 大家已点展示

前台展示每道菜：

- 总份数
- 点菜人及数量

示例：

```text
宫保鸡丁 x3
小王 x1  小李 x2
```

## 8. 后台功能

后台页面：

```text
apps/web/src/pages/AdminHome.vue
```

访问路径：

```text
/admin
```

### 登录

后台使用用户名和密码登录。

登录成功后，前端将 token 保存到：

```text
localStorage.adminToken
```

### 仪表盘

显示：

- 当前活动订单数
- 当前活动已点份数
- 当前活动二维码

交互：

- 点击“订单数”卡片可跳转到订单列表。

### 活动管理

支持：

- 查看全部历史活动
- 新建活动
- 编辑活动
- 开放活动
- 关闭活动
- 删除活动
- 查看活动
- 新建活动时复制历史活动菜单

新建活动逻辑：

- 如果选择“复制历史菜单”，则复制来源活动菜单。
- 如果不选择历史活动，则默认加入所有已启用菜品。

删除活动说明：

- 删除活动会级联删除该活动订单和活动菜单。

### 菜品管理

支持：

- 新增菜品
- 编辑菜品
- 上传菜品图片
- 粘贴图片 URL
- 设置分类
- 设置标签
- 设置份量说明
- 设置每份备菜食材
- 加入当前活动
- 从当前活动移除
- 从历史活动复制菜单到当前活动

图片保存位置：

```text
uploads/dishes
```

图片访问路径：

```text
/uploads/dishes/xxx.png
```

### 订单列表

支持：

- 查看当前活动订单
- 查看点菜人
- 查看菜品明细
- 查看备注
- 查看提交时间
- 删除订单

删除订单后：

- 订单明细会一起删除
- 菜品份数汇总会更新
- 食材汇总会更新

### 备菜汇总

包含两部分：

1. 菜品份数
2. 食材清单

菜品份数示例：

```text
宫保鸡丁  3  小王 x1，小李 x2
```

食材清单示例：

```text
鸡腿肉 900g  来源：宫保鸡丁 x3
花生   120g  来源：宫保鸡丁 x3
```

## 9. 后端 API

后端入口：

```text
apps/server/src/index.ts
```

### 公共接口

健康检查：

```http
GET /health
```

获取活动信息：

```http
GET /api/events/:code
```

获取菜单：

```http
GET /api/events/:code/menu
```

提交订单：

```http
POST /api/events/:code/orders
```

请求体：

```json
{
  "guestName": "小王",
  "guestToken": "optional",
  "note": "少辣",
  "items": [
    {
      "dishId": "dish_id",
      "quantity": 2,
      "note": "不要香菜"
    }
  ]
}
```

查看个人订单：

```http
GET /api/events/:code/orders/:guestToken
```

查看大家已点：

```http
GET /api/events/:code/summary
```

### 后台认证

登录：

```http
POST /api/admin/login
```

请求体：

```json
{
  "username": "admin",
  "password": "admin123456"
}
```

获取当前管理员：

```http
GET /api/admin/me
```

### 活动管理

活动列表：

```http
GET /api/admin/events
```

新建活动：

```http
POST /api/admin/events
```

编辑活动：

```http
PUT /api/admin/events/:id
```

删除活动：

```http
DELETE /api/admin/events/:id
```

复制菜单到活动：

```http
POST /api/admin/events/:id/copy-menu
```

请求体：

```json
{
  "fromEventId": "source_event_id"
}
```

活动二维码：

```http
GET /api/admin/events/:id/qrcode
```

### 活动菜单

查看活动包含的菜品：

```http
GET /api/admin/events/:id/dishes
```

加入菜品到活动：

```http
POST /api/admin/events/:id/dishes/:dishId
```

从活动移除菜品：

```http
DELETE /api/admin/events/:id/dishes/:dishId
```

### 菜品管理

菜品列表：

```http
GET /api/admin/dishes
```

新增菜品：

```http
POST /api/admin/dishes
```

编辑菜品：

```http
PUT /api/admin/dishes/:id
```

### 分类管理

分类列表：

```http
GET /api/admin/categories
```

新增分类：

```http
POST /api/admin/categories
```

### 图片上传

上传菜品图片：

```http
POST /api/admin/uploads/dish-image
```

请求格式：

```text
multipart/form-data
file: 图片文件
```

限制：

- 支持 `jpg`
- 支持 `png`
- 支持 `webp`
- 支持 `gif`
- 最大 5MB

返回：

```json
{
  "url": "/uploads/dishes/xxx.png"
}
```

### 订单管理

查看活动订单：

```http
GET /api/admin/events/:id/orders
```

删除订单：

```http
DELETE /api/admin/orders/:id
```

### 汇总

菜品汇总：

```http
GET /api/admin/events/:id/summary
```

食材汇总：

```http
GET /api/admin/events/:id/ingredients
```

## 10. 图片管理

当前图片管理方式：

- 后台上传图片
- 后端保存到本地 `uploads/dishes`
- 数据库 `Dish.imageUrl` 保存相对路径

示例：

```text
/uploads/dishes/1781081264840-467a37f02df83477.png
```

静态文件服务：

```ts
app.use("/uploads/*", serveStatic({ root: workspaceRoot }));
```

部署备份时必须保留：

```text
uploads/
data/app.db
```

## 11. 权限与安全

已实现：

- 后台登录
- 密码 bcrypt 哈希
- 后台接口 Bearer Token 验证
- 图片类型限制
- 图片大小限制
- 活动访问短码

需要部署前修改：

```env
JWT_SECRET="change-me-before-deploy"
```

当前未实现：

- token 续期
- 多管理员权限细分
- 操作日志
- 图片删除回收
- 接口限流

## 12. 部署建议

### 轻量部署

推荐单机部署：

- Node.js 服务
- SQLite 文件
- 本地 uploads 目录
- Nginx 反向代理，可选
- PM2 管理进程，可选

### 需要持久化的数据

```text
data/app.db
uploads/
```

只要这两个保留，核心业务数据和图片就能恢复。

### 生产构建

```bash
npm.cmd run build
```

后端产物：

```text
apps/server/dist
```

前端产物：

```text
apps/web/dist
```

## 13. 备份策略

建议备份：

```text
data/app.db
uploads/
```

频率：

- 聚餐前备份一次
- 聚餐后备份一次
- 长期使用时每日备份一次

## 14. 已知提醒

前端构建时可能出现 chunk size 警告：

```text
Some chunks are larger than 500 kB after minification
```

原因：

- Element Plus
- Vant
- Vue 相关依赖

当前不影响使用。后续可通过按需加载和路由拆包优化。

## 15. 后续可优化方向

建议优先级：

1. 图片压缩和删除旧图片
2. 菜品分类编辑/删除
3. 菜品启用/停用
4. 活动菜单排序
5. 导出备菜清单 Excel
6. 打印备菜清单
7. 多管理员账号
8. 后台操作日志
9. 手机端后台适配优化
10. Docker Compose 部署文件

