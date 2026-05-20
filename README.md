# warranty-h5

门锁安装登记与安装确认项目，现已统一为 `Next.js + Prisma + Supabase Postgres`。

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
- Supabase Postgres
- Tailwind CSS 4
- Solapi SMS
- `html5-qrcode` 与 `tesseract.js`

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

复制 [.env.example](/Users/zhiyongsong/warranty-h5/.env.example) 到 `.env.local`，按需修改。

关键变量：

- `DATABASE_URL`: Supabase transaction pooler 连接串，建议使用 `:6543` 并追加 `?pgbouncer=true&connection_limit=1`
- `DIRECT_URL`: Supabase direct/session 连接串，供 Prisma schema push / migrate
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 前端配置
- `SUPABASE_SERVICE_ROLE_KEY`: 服务端高权限 key
- `MANAGEMENT_ACCESS_CODE`: 기본 관리자 로그인 코드, `admins.login_code` 초기값 동기화에도 사용
- `MANAGEMENT_SESSION_SECRET`: 관리 페이지 세션 서명용 secret
- `MANAGEMENT_ADMIN_NAME`: 기본 관리자 이름
- `MANAGEMENT_ADMIN_LEVEL`: 기본 관리자 등급
- `NEXT_PUBLIC_BASE_URL`: 生成短信确认链接时使用的站点地址，例如 `https://warranty-aqaralife.vercel.app`
- `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER`: Solapi SMS 凭证与发信号码（在 KISA 备案过的号）。三者任一为空时短信会静默跳过，不影响业务流。
- `INTERNAL_API_KEY`: 其他项目调用本项目 `/api/internal/sms` 时使用的 `x-internal-key` 头

### 3. 初始化 Supabase 数据库

```bash
npm run prisma:generate
npx prisma db push
```

### 4. 从本地 MySQL 迁移现有数据

如果你本地还有旧的 Docker MySQL 数据源，先启动它：

```bash
npm run db:up
```

然后把当前三张表全量迁移到 Supabase：

```bash
npm run db:migrate-local-to-supabase
```

### 5. 기본 관리자 동기화

`admins` 表用于管理登录码、姓名、等级。默认会用环境变量里的管理员信息做一次 upsert：

```bash
npm run db:sync-default-admin
```

其中：

- `level = 1`: 可新增、删除、修改 `installers`
- `level = 0`: 仅查看

### 6. 导入 CSV（可选）

将 CSV 放在 [data/shipped.csv](/Users/zhiyongsong/warranty-h5/data/shipped.csv)，然后执行：

```bash
npm run db:import-shipped
```

如需导入安装人员数据，将 CSV 放在 [data/installer.csv](/Users/zhiyongsong/warranty-h5/data/installer.csv)，然后执行：

```bash
npm run db:import-installers
```

该脚本用于从 CSV 刷新安装人员数据。

### 7. 启动项目

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 内部 SMS 网关

其他项目可以借用本项目的 Solapi 通道：

```http
POST /api/internal/sms
x-internal-key: <INTERNAL_API_KEY>
content-type: application/json

{
  "to": "01012345678",
  "text": "문자 내용"
}
```

号码会被 normalize 成韩国本地号（`+8210...` / `8210...` 都会还原成 `010...`）。

## 常用脚本

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run db:migrate-local-to-supabase`
- `npm run db:sync-default-admin`
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

- 已切换到 Supabase Postgres，运行时 API 全部改为 Prisma 查询
- 首页和 metadata 已改为业务项目说明
- 增加了 `.env.example` 和 Prisma / DB 开发脚本

## 仍建议后续处理

- 给 `prisma/migrations` 生成并提交初始 migration
- 把 [src/app/privacy/page.tsx](/Users/zhiyongsong/warranty-h5/src/app/privacy/page.tsx) 的占位文案替换成正式版本
- 视情况增加 API 单测和集成测试
