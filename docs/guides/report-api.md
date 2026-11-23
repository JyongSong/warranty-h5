# Aqara 设置/保修系统 · 数据接口说明（只读）

用于拉取设置/保修系统（warranty-h5）的原始数据：设置订单、기사 名单、结算、保修登记、A/S，供脚本或 AI 做分析。接口只读，不会修改任何数据。

> 这是 warranty-h5 自己的接口。Aqara 发注系统（aqara-distro）是另一个数据库，它的数据要用那边的 `/api/report`。

## 1. 基本信息

| 项目 | 内容 |
|---|---|
| Base URL | `https://www.aqaralife-service.kr/api/report` |
| 方法 | 只有 `GET` |
| 认证 | 请求头 `Authorization: Bearer <API_KEY>`（API Key 另外单独发送） |
| 返回格式 | 默认 JSON；加 `?format=csv` 返回 CSV（UTF-8 带 BOM，Excel 能直接打开） |

> ⚠️ **这个 Key 能读到全部客户的姓名、电话、地址（已解密的明文）**，以及기사电话。
> - 不要写进代码仓库、文档、群聊或邮件正文。
> - 用 AI 分析时，先把数据下载成文件再上传，不要把 Key 交给 AI。
> - 怀疑 Key 泄露时，联系开发更换（改 Vercel 环境变量 `REPORT_API_KEY` 后重新部署，旧 Key 立刻失效）。

## 2. 接口一览

| 接口 | 每一行代表 | `from`/`to` 按哪个时间筛选 | 当前数据量（2026-11-17 参考） |
|---|---|---|---|
| `GET /installation-orders` | 一张设置订单 | 订单生成时间 `created_at` | 411 |
| `GET /installers` | 一位기사 | 不筛选 | 178 |
| `GET /settlement-lines` | 一笔结算（一单完成 = 一行） | 完成时间 `completed_at` | 139 |
| `GET /settlement-statements` | 一张月结算单 | 发行时间 `created_at` | 1 |
| `GET /warranty-registrations` | 一条保修登记（一个 SN） | 提交时间 `submitted_at` | 1,275 |
| `GET /as-orders` | 一张 A/S 单 | 生成时间 `created_at` | 1 |

## 3. 通用参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `format` | `json` 或 `csv` | `json` |
| `page` | 页码，从 1 开始 | `1` |
| `page_size` | 每页行数，1–1000 | `1000` |
| `from` / `to` | 日期 `YYYY-MM-DD`，按韩国时间（KST）整天计算，两端都包含。筛选的时间字段见上表 | 不限 |

JSON 返回结构：

```json
{
  "resource": "installation-orders",
  "total": 411,
  "page": 1,
  "page_size": 1000,
  "data": [ { "...": "..." } ]
}
```

- `total` 是符合条件的总行数。`total` 大于 `page_size` 时要翻页，直到 `data` 为空。
- CSV 没有外层结构，总行数在响应头 `X-Total-Count` 里。
- 响应头 `X-Pii-Decrypt-Failures`：解密失败而留空的客户信息格数。正常是 `0`；不是 0 说明服务器的解密 Key 有问题，请联系开发。
- 参数错误返回 `400`，Key 错误返回 `401`，接口名错误返回 `404`。

## 4. 数据约定

- **时间**：`*_at` 字段是 UTC 的 ISO 8601（如 `2026-11-17T02:13:45.123Z`），换算韩国时间 +9 小时。`due_date`、`install_date` 等 `*_date` 字段是原样保存的文本日期。
- **金额**：韩元（KRW），整数。
- **空值**：JSON 里是 `null`，CSV 里是空单元格。
- **关联**：
  - `installation-orders.installer_id` = `installers.id`
  - `settlement-lines.source_order_id` = `installation-orders.id`（`source_type = INSTALL` 时）或 `as-orders.id`（`source_type = AS` 时）
  - `settlement-lines.erp_order_no` / `installation-orders.erp_order_no` 是 ERP 主文番号，两边可以直接对。

## 5. 字段说明

### 5.1 `/installation-orders` 设置订单

| 字段 | 说明 |
|---|---|
| `id` | 订单 ID |
| `erp_order_no` | ERP 主文番号 |
| `channel` | 渠道：`SELF`（自营）/ `CJ` 等 |
| `external_order_no` / `external_order_date` | 外部渠道（如 CJ）订单号、下单日 |
| `order_numbers` | ERP 上的订单号（可能多个） |
| `due_date` | ERP 납기일 |
| `status` | 订单状态，见下表 |
| `customer_name` / `customer_phone` | 客户姓名、电话。客户填过资料就用客户填的，否则用 ERP 上的 |
| `orderer_phone` | 下单人电话（客户自己填的） |
| `install_address` | 设置地址（客户填的地址 + 详细地址；没填就是 ERP 地址） |
| `source_address` | ERP 原始地址 |
| `customer_input_status` | 客户资料填写状态：`PENDING_INPUT` 未填 / `SUBMITTED` 已填 / `FALLBACK_USED` 用 ERP 资料代替 / `CANCELLED` |
| `customer_submitted_at` | 客户提交资料时间 |
| `install_date` / `install_time_slot` | 客户希望的设置日期、时段 |
| `customer_note` | 客户备注 |
| `memo` | ERP 메모（含品目信息） |
| `installer_id` / `installer_name` / `installer_phone` | 当前배정기사 |
| `agent_proxy` | 是否총판 대행 배정 |
| `partner_name` / `partner_status` / `partner_claim_amount` / `partner_completed_at` | 外部协力社（PL ENG）배정情况 |
| `has_open_issue` | 是否有未处理的异常 |
| `completion_submitted_at` | 기사提交完成登记的时间 |
| `install_end_at` | 기사填的实际设置完成时间 |
| `completion_review_status` | 本社审核：`PENDING` / `APPROVED` / `REJECTED` |
| `completion_reviewed_at` | 审核时间 |
| `aqara_app_capability` | 完成时的 App/허브 연동结果 |
| `wallpad_result` | 월패드 연동：`SUCCESS` / `FAIL` / `NOT_ATTEMPTED` |
| `wallpad_billing` | 월패드 费用：`HQ` 本社清算 / `ONSITE` 现场收款 |
| `wallpad_brand` / `wallpad_model` | 월패드 品牌、型号 |
| `long_distance_amount` / `extra_claim_amount` | 장거리、기타 청구金额 |
| `settlement_total` | 这单的结算总额（审核通过后才有） |
| `cancelled_at` / `cancel_reason` | 取消时间、原因 |
| `created_at` / `status_changed_at` | 订单生成时间、最后一次状态变化时间 |

`status` 取值：

| 值 | 含义 |
|---|---|
| `CUSTOMER_INPUT_SMS_REQUIRED` | 待发客户资料填写短信 |
| `WAITING_CUSTOMER_INPUT` | 等客户填资料 |
| `READY_FOR_CANDIDATE_SELECTION` | 待选기사 |
| `WAITING_ADMIN_REVIEW` | 等管理员确认배정 |
| `WAITING_INSTALLER_RESPONSE` | 等기사接单 |
| `INSTALLER_ASSIGNED` | 기사已接单 |
| `WAITING_HQ_REVIEW` | 完成登记，等本社审核 |
| `COMPLETED` | 完成 |
| `CANCELLED` | 取消 |

### 5.2 `/installers` 기사 名单

不含结算账户、사업자 信息。

| 字段 | 说明 |
|---|---|
| `id` / `name` / `phone` | 기사 ID、姓名、电话 |
| `branch` / `region` / `coverage` / `address` | 所属、地区、负责区域（原文）、住址 |
| `service_areas` / `capabilities` | 负责区域、可做的品目（逗号分隔） |
| `aqara_app_capability` / `has_aqara_hub_inventory` | App/허브 연동能力、是否有허브库存 |
| `active` | 是否在派单 |
| `is_agent` | 是否총판账号 |
| `in_current_roster` | 是否在最新기사名单里 |
| `as_emergency_availability` | A/S 긴급출동 是否可以（原文） |
| `app_installed` / `app_last_seen_at` | 是否装了기사 App、最后一次使用时间 |
| `profile_confirmed_at` | 기사确认本人信息的时间 |
| `latitude` / `longitude` | 住址坐标 |
| `current_order_count` | 当前挂在这位기사名下的订单数 |

### 5.3 `/settlement-lines` 结算明细

本社审核通过一单，就生成一行。

| 字段 | 说明 |
|---|---|
| `source_type` | `INSTALL` 设置 / `AS` |
| `source_order_id` / `erp_order_no` | 对应订单 ID、ERP 主文番号 |
| `completed_at` | 完成时间（月结算按这个时间归月） |
| `installer_id` / `installer_name` | 기사 |
| `linkage_fee` | 연동비 |
| `travel_fee` | 출장비 |
| `long_distance_fee` | 장거리 |
| `night_weekend_fee` | 야간/주말 |
| `service_fee` | A/S 服务费 |
| `extra_claim_fee` | 기타 청구 |
| `wallpad_fee` | 월패드 本社清算金额（计入结算） |
| `wallpad_onsite_amount` | 월패드 现场收款（仅参考，不计入结算） |
| `total_amount` | 合计（不含 `wallpad_onsite_amount`） |
| `statement_ym` / `statement_seq` | 进了哪张月结算单（年月、第几张） |

### 5.4 `/settlement-statements` 月结算单

| 字段 | 说明 |
|---|---|
| `ym` / `seq` | 年月、第几张（1 = 正常，2 以上 = 迟审核的追加单） |
| `installer_id` / `installer_name` | 기사 |
| `line_count` / `base_amount` | 包含的笔数、供给价 |
| `tax_doc_type` / `vat_amount` / `pay_amount` | 증빙种类、부가세、实付金额 |
| `evidence_status` | 증빙：`PENDING` / `SUBMITTED` / `REJECTED` / `CONFIRMED` |
| `evidence_submitted_at` / `evidence_reviewed_at` / `paid_at` | 提交、审核、付款时间 |

### 5.5 `/warranty-registrations` 保修登记

| 字段 | 说明 |
|---|---|
| `sn` | 产品 SN |
| `install_type` | 设置方式 |
| `install_date` | 设置日 |
| `user_phone` / `installer_phone` | 用户、기사电话 |
| `status` | 登记状态 |
| `free_as_end_date` | 免费 A/S 截止日 |
| `consent_privacy` / `consent_marketing` | 个人信息、营销同意 |
| `submitted_at` / `confirmed_at` / `confirmed_by` | 提交、确认时间、确认方式 |
| `survey_sent_at` | 满意度调查发送时间 |

### 5.6 `/as-orders` A/S

| 字段 | 说明 |
|---|---|
| `status` | `WAITING_ASSIGNMENT` / `WAITING_INSTALLER_RESPONSE` / `INSTALLER_ASSIGNED` / `WAITING_HQ_REVIEW` / `COMPLETED` / `CANCELLED` |
| `customer_name` / `customer_phone` / `address` | 客户信息（已解密） |
| `symptom_code` / `symptom_detail` | 症状 |
| `order_no` / `original_installation_order_id` | 原订单号、原设置订单 ID |
| `installer_id` / `installer_name` | 기사 |
| `assigned_at` / `responded_at` / `installer_reject_reason` | 배정、回应时间、拒绝理由 |
| `resolution_detail` / `service_fee` | 处理内容、服务费 |
| `submitted_at` / `review_status` / `reviewed_at` | 完成提交、审核 |

## 6. 调用示例

### curl

```bash
# 11 月的设置订单，保存为 CSV
curl -H "Authorization: Bearer $AQARA_SERVICE_REPORT_KEY" \
  "https://www.aqaralife-service.kr/api/report/installation-orders?from=2026-11-01&to=2026-11-30&format=csv" \
  -o installation-orders-2026-11.csv
```

### Python（自动翻页，拉取全部数据）

```python
import os
import requests
import pandas as pd

BASE = "https://www.aqaralife-service.kr/api/report"
HEADERS = {"Authorization": f"Bearer {os.environ['AQARA_SERVICE_REPORT_KEY']}"}


def fetch_all(resource: str, **params) -> pd.DataFrame:
    rows, page = [], 1
    while True:
        res = requests.get(f"{BASE}/{resource}", headers=HEADERS,
                           params={**params, "page": page}, timeout=60)
        res.raise_for_status()
        body = res.json()
        rows.extend(body["data"])
        if not body["data"] or len(rows) >= body["total"]:
            return pd.DataFrame(rows)
        page += 1


orders = fetch_all("installation-orders", **{"from": "2026-11-01", "to": "2026-11-30"})
lines = fetch_all("settlement-lines", **{"from": "2026-11-01", "to": "2026-11-30"})

# 例：各状态的订单数
print(orders["status"].value_counts())

# 例：各기사 11 月完成件数和结算额
print(lines.groupby("installer_name")
      .agg(jobs=("id", "count"), amount=("total_amount", "sum"))
      .sort_values("amount", ascending=False).head(10))
```
