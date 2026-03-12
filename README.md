# warranty-h5

门锁安装登记与安装确认项目，现已统一为 `Next.js + Prisma + MySQL`。

## 当前业务流

1. 访问 `/reg` 提交安装信息。
2. 后端校验 SN 是否存在于 `shipped_devices`。
3. 写入 `warranty_registrations`，生成 72 小时确认 token。
4. 通过短信给安装人员发送 `/confirm?t=...` 链接。
5. 安装人员在 `/confirm` 查看信息并确认完成安装。

## 技术栈

- Next.js 16 App Router
- React 19
- Prisma 7
- MySQL 8
- Tailwind CSS 4
- Twilio / mock SMS
- `html5-qrcode` 与 `tesseract.js`

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

复制 [.env.example](/Users/zhiyongsong/warranty-h5/.env.example) 到 `.env.local`，按需修改。

关键变量：

- `DATABASE_URL`: MySQL 连接串
- `NEXT_PUBLIC_BASE_URL`: 生成短信确认链接时使用的站点地址
- `SMS_PROVIDER`: `mock` 或 `twilio`
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM`: 使用 Twilio 时必填

### 3. 启动 MySQL

```bash
npm run db:up
```

默认 `docker-compose.yml` 会启动一个本地 MySQL：

- host: `127.0.0.1`
- port: `3307`
- database: `warranty`
- user: `warranty`
- password: `warranty`

### 4. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. 导入出货清单

将 CSV 放在 [data/shipped.csv](/Users/zhiyongsong/warranty-h5/data/shipped.csv)，然后执行：

```bash
npm run db:import-shipped
```

如需导入安装人员数据，将 CSV 放在 [data/installer.csv](/Users/zhiyongsong/warranty-h5/data/installer.csv)，然后执行：

```bash
npm run db:import-installers
```

该脚本会通过 Docker 容器内的 MySQL 以 `utf8mb4` 全量刷新 `installers`，用于避免韩文乱码。

### 6. 启动项目

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 常用脚本

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run db:up`
- `npm run db:down`
- `npm run db:import-shipped`
- `npm run db:import-installers`

## 目录说明

- [src/app/reg](/Users/zhiyongsong/warranty-h5/src/app/reg): 安装登记页面和扫码/OCR
- [src/app/confirm](/Users/zhiyongsong/warranty-h5/src/app/confirm): 安装确认页面
- [src/app/api](/Users/zhiyongsong/warranty-h5/src/app/api): 登记、确认、重发短信接口
- [src/app/api/installers/route.ts](/Users/zhiyongsong/warranty-h5/src/app/api/installers/route.ts): 安装人员查询接口
- [src/lib/prisma.ts](/Users/zhiyongsong/warranty-h5/src/lib/prisma.ts): Prisma 单例
- [prisma/schema.prisma](/Users/zhiyongsong/warranty-h5/prisma/schema.prisma): 数据模型
- [scripts/import-shipped-devices.mjs](/Users/zhiyongsong/warranty-h5/scripts/import-shipped-devices.mjs): 出货清单导入脚本
- [scripts/import-installers.mjs](/Users/zhiyongsong/warranty-h5/scripts/import-installers.mjs): 安装人员导入脚本

## 当前整理结果

- 已移除运行时 Supabase 依赖，API 全部改为 Prisma 查询
- 首页和 metadata 已改为业务项目说明
- 增加了 `.env.example` 和 Prisma / DB 开发脚本

## 仍建议后续处理

- 给 `prisma/migrations` 生成并提交初始 migration
- 把 [src/app/privacy/page.tsx](/Users/zhiyongsong/warranty-h5/src/app/privacy/page.tsx) 的占位文案替换成正式版本
- 视情况增加 API 单测和集成测试
