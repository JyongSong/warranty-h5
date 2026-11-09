# 총판 대행 배정 설계안（草案，2026-11-09）

## 1. 背景

有些地区没有技师覆盖，但偶尔会有订单。这类订单交给총판，由총판找当地技师处理，完工后由총판上传结果、申请费用。

총판在系统里已有技师账号（대행单固定给김경민），所以不新建登录体系，直接复用技师派单 → 接单 → 完工登记 → 本部审核 → 月结算这条线。

## 2. 已确定的事项（用户答复）

| 项目 | 决定 |
|---|---|
| 총판 | 1 家。**대행单全部给 김경민（010-4265-9955，경영하드웨어）**（2026-11-09 更正，김동수不接대행单） |
| 金额 | 기본 출장비（**默认 50,000，可修改**，见 §6）+ 기타 청구（총판自填金额和事由） |
| 审核 | 提交后必须经管理员审核，批准时金额才确定 |
| 照片 | 可选（0~4 张） |
| A/S | 由총판负责 |
| 客户通知 | 显示接单총판账号的名字和电话；以后可能改（见 §9） |
| 기타 청구上限 | 不设，靠审核把关 |

## 3. 核心设计：「대행」是订单上的标记，不是人的属性

총판账号以后也可能接普通单。所以特殊规则（固定 50,000、照片可选、自填기타 청구）**只看订单是否为대행**，不看接单的是谁。

- `installation_orders.agent_proxy`（boolean，默认 false）
- 本部选择「총판 대행 배정」时设为 true。改派给普通技师时改回 false
- 총판账号另加 `installers.is_agent`（boolean），**只用来**决定대행单派给谁，不影响任何金额规则。目前只有김경민为 true
- 没有任何账号为 true 时，「총판 대행 배정」按钮提示「총판 계정이 설정되지 않았습니다」；以后如果有多个，对话框再改成选择

## 4. 流程

```
고객 제출 → 자동배정 후보 없음（或本部判断该地区无人）
   → 本部在设置详情页点「총판 대행 배정」→ 确认对话框（固定：김경민 · 경영하드웨어）
   → 和普通派单一样：总판收到推送/短信 → 수락
   → 总판找当地技师施工
   → 总판在技师 App 做「완료 등록」（대행模式）
   → WAITING_HQ_REVIEW → 管理员审核：批准（可调整기타 청구金额）/ 반려
   → 批准时生成结算 snapshot → 进入总판当月结算
```

- **先只做手动配单**。系统不自动转给총판。等这类订单变多，再考虑「无候选时自动转」。
- 现有手动配单对话框已经能选任意技师。这里新增一个单独的按钮「총판 대행 배정」，因为它除了指定技师，还要把 `agent_proxy` 设为 true。手动配单原因自动填「총판 대행」。

## 4.1 技师 App 订单卡片 / 推送

- 沿用现有 `OrderCard`（`src/app/installer/cards.tsx`），대행单多两处：
  - 状态标签旁加紫色「총판 대행」标签，卡片边框也用紫色（和现有黄/绿/蓝状态色区分开）
  - 수락 전显示提示框：「담당 기사 없는 지역 · 현지 기사 섭외 필요 / 기본 출장비 50,000원 + 기타 청구」。수락 후隐藏
- 客户信息照旧，수락后才显示
- 推送和短信标题前加 `[총판 대행]`

## 5. 技师 App：대행模式完工登记

完工页沿用 `/installer/orders/[orderId]/complete`，订单为대행时变化如下：

| 部分 | 普通单 | 대행单 |
|---|---|---|
| 顶部提示 | — | 「총판 대행 건 — 기본 출장비 + 기타 청구」 |
| 기본 출장비 | — | **金额输入框，预填默认值（50,000），총판可修改** |
| 설치 사진 | 必填 1~4 张 | **可选 0~4 张** |
| 설치 완료 시각 | 必填 | 必填（不变） |
| 앱 연동 능력 / 연동 사진 | 必填 | 隐藏，不计费 |
| 월패드 | 显示 | 隐藏（如有费用，并入기타 청구） |
| 원거리 | 显示 | 隐藏 |
| 기타 청구 | 选填：金额 + 事由（事由必填）+ 照片 | 不变 |
| 실제 시공자 | — | **新增，选填**：当地技师姓名/电话，用于以后追溯 A/S |
| 金额预览 | 按单价计算 | 기본 출장비 + 기타 청구 |

## 6. 结算

### 6.1 기본 출장비：默认 50,000，三处可改

| 谁 | 在哪里 | 改的是什么 |
|---|---|---|
| 本部 | 단가 설정页新增「총판 대행 기본 출장비」（全局默认，初始 50,000） | 以后新的대행单默认用多少，**不用改代码** |
| 총판 | 完工登记页（预填默认值） | 这一单申请多少 |
| 管理员 | 审核面板（批准时） | 这一单最终批准多少 |

- 每单的金额存在完工记录上（`agent_proxy_base_fee`），批准时冻结进 snapshot。以后改全局默认值，**不影响已经批准的单**
- 총판提交金额和默认值不同时，审核面板用橙色标出「기본값 50,000 → 신청 xx」，方便管理员注意
- 不设上限，下限 0

### 6.2 计算

新增 `computeAgentProxyLineItems`（`src/lib/installation/settlement/compute.ts`）：

- `travelFee` = 这一单批准的기본 출장비（不使用技师个人单价 override）
- `extraClaimFee` = 管理员批准的기타 청구金额
- 연동、원거리、할증、월패드全部为 0
- `totalAmount` = 기본 출장비 + 기타 청구

批准时用这个函数生成 snapshot。后台修改（admin-edit）和重算（rebuild）同样按대행规则计算。
月结算（本部 `installers-settlement`、技师 App 이력/정산）的대행行显示「대행」标签。

## 7. 管理员审核

- 沿用现有 `CompletionReviewPanel`。대행单在顶部显示「총판 대행」标签、실제 시공자，照片为 0 张时显示「사진 없음」，不报错
- 批准时可以调整기본 출장비（新增）和기타 청구金额（现有功能）
- 대행单**一律需要人工审核**，不走任何自动批准

## 8. A/S

现有 A/S 已经是本部手动指定技师，并由本部批准 serviceFee，**不需要改动**：选择총판账号即可。
可选的小改进：A/S 推荐技师列表里，如果原安装单是대행，把总판账号排到最前。

## 9. 其他细节

- 客户通知：现在和普通单一样，显示接单총판账号的名字和电话。考虑到以后可能改成显示「실제 시공자」或固定的총판代表号码，客户通知里的「技师名字/电话」统一由一个函数取值（대행单分支放在那里），以后改的时候只改一处

- 대행单不计入总판账号的 `monthly_dispatch_count`，避免影响自动派单的平衡
- 기사 지도 / 배정 거리：대행单不显示距离，或显示时不作参考
- 설치 업무 큐：다음 액션文案加「총판 대행」，운영-정산金额栏显示기본 출장비 + 기타 청구

## 10. DB 变更（由用户执行）

最终 SQL 在实现时和代码一起给出（表名、列名以 `prisma/schema.prisma` 为准）。大致内容：

```sql
ALTER TABLE installers ADD COLUMN is_agent boolean NOT NULL DEFAULT false;
ALTER TABLE installation_orders ADD COLUMN agent_proxy boolean NOT NULL DEFAULT false;
ALTER TABLE installation_orders ADD COLUMN agent_proxy_assigned_at timestamptz;
-- 完工记录表：기본 출장비、실제 시공자
-- ALTER TABLE <completion table> ADD COLUMN agent_proxy_base_fee integer;
-- ALTER TABLE <completion table> ADD COLUMN actual_installer text;
-- 全局单价表：총판 대행 기본 출장비，默认 50000
-- ALTER TABLE <rate settings table> ADD COLUMN agent_proxy_base_fee integer NOT NULL DEFAULT 50000;
```

标记총판账号时按电话匹配（电话去掉横线后比较）并核对名字，加防护：只有正好命中 1 个账号时才更新，否则返回 0 行。结果里会带出상호（`branch`），可以核对是不是 경영하드웨어：

```sql
WITH target AS (
  SELECT id FROM installers
  WHERE regexp_replace(phone, '\D', '', 'g') = '01042659955' AND name = '김경민'
), guard AS (
  SELECT count(*) = 1 AS ok FROM target
)
UPDATE installers SET is_agent = true
WHERE id IN (SELECT id FROM target) AND (SELECT ok FROM guard)
RETURNING id, name, phone, branch, active;
```

## 11. 实现顺序 / 依赖

- 计算、完工、审核、结算这几处文件，和 `feat/wallpad-billing`（未提交，DDL 也未执行）改的是同一批文件。**先把 wallpad-billing 合并到 main，再从 main 开新分支 `feat/agent-proxy`**，避免冲突
- 步骤：结算计算和测试 → 完工 service 校验分支 → 技师 App 完工页 → 本部대행배정按钮 → 审核面板和月结算标签 → 큐文案

## 12. 确认记录（2026-11-09）

1. 客户通知显示총판账号的名字和电话，以后可能改 → §9，取值集中在一处
2. 기타 청구不设上限
3. 기본 출장비默认 50,000，可修改 → §6.1（全局默认 / 총판申请 / 管理员批准，三处可改）
4. 총판账号：대행单全部给 김경민（010-4265-9955，경영하드웨어），김동수不接 → §3、§10

## 13. 实现记录（2026-11-09，分支 `feat/agent-proxy`）

- **DB**：`installers.is_agent`、`installation_orders.agent_proxy` / `agent_proxy_assigned_at`、`installation_completions.agent_proxy_base_fee` / `actual_installer`。给用户执行的 SQL：`claudedocs/sql-agent-proxy.sql`（含按电话+名字标记김경민，只命中 1 人才更新）
- **默认 기본 출장비**：系统设置 `installation.settlement.agentProxyBaseFee`（不存时为 50,000），在「시스템 설정」里改；기사 정산 → 요율 설정页显示当前值
- **配单**：`assignInstallationOrderToAgent`（`manual-operations.ts`）。找 `is_agent && active` 正好 1 个的账号；订单还没技师按「직접 지정」，已有技师按「재배정」（通知原技师）；不检查地区/能力；原因记为「총판 대행」。普通직접 지정/재배정和自动派单都会把 `agent_proxy` 清回 false
- **判断是否대행**：订单看 `agent_proxy`；完工记录看 `agent_proxy_base_fee` 是否非 null（结算计算、快照、审核、승인 후 수정都按这个）
- **技师 App**：卡片/详情紫色「총판 대행」标签 + 接单前提示；完工页走单独的 `AgentProxyCompleteClient`（기본 출장비、기타 청구、실제 시공자、照片 0~4）；推送标题前加 `[총판 대행]`
- **短信未改**：派单短信是알림톡模板，改文字需要重新审批模板，所以没有加 `[총판 대행]`
- **结算**：`computeInstallLineItems` 收到 `agentProxyBaseFee` 时只算 기본 출장비 + 기타 청구；breakdown 记 `agentProxy: true`，本部结算列表和技师 App 이력/정산显示「대행」
