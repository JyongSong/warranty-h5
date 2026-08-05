import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { fetchOrderDetails } from "@/lib/cafe24";

// 目标商品代码 (Cafe24 商品代码 P00000SE)
const TARGET_PRODUCT_CODE = "P00000SE";

/**
 * 校验 Cafe24 webhook 请求是否合法。
 *
 * Cafe24 后台配置的接收 URL 上带一个共享 secret（query `key` 或 header
 * `x-cafe24-webhook-key`），与环境变量 `CAFE24_WEBHOOK_SECRET` 做 timing-safe 比对。
 *
 * - 未配置 `CAFE24_WEBHOOK_SECRET`：放行并打警告日志（向后兼容，便于灰度上线，
 *   在你把 secret 配好之前不会中断现有付款激活）。
 * - 已配置：缺失或不匹配的 key 一律拒绝。
 */
export function isAuthorizedCafe24Webhook(req: Request): boolean {
  const secret = process.env.CAFE24_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn(
      "[Cafe24 Webhook] CAFE24_WEBHOOK_SECRET 未配置 — 跳过校验（不安全）。请尽快在环境变量和 Cafe24 webhook URL 中配置。",
    );
    return true;
  }

  const provided =
    new URL(req.url).searchParams.get("key")?.trim() ||
    req.headers.get("x-cafe24-webhook-key")?.trim() ||
    "";
  if (!provided) return false;

  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, secretBuf);
}

export async function POST(req: Request) {
  if (!isAuthorizedCafe24Webhook(req)) {
    console.warn("[Cafe24 Webhook] 拒绝未授权请求（key 缺失或不匹配）。");
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // 只记录路由所需的非敏感字段，避免把买家 PII（手机/邮箱）打进日志
    console.log("[Cafe24 Webhook] 收到事件:", {
      event: body?.event ?? body?.resource?.event_code,
      resource_id: body?.resource_id ?? body?.resource?.order_id,
      mall_id: body?.mall_id ?? body?.resource?.mall_id,
    });

    let parsedEvent = body.event;
    let parsedResourceId = body.resource_id;
    let parsedMallId = body.mall_id;

    // 兼容后台手动配置的 webhook 嵌套格式
    if (body.resource && typeof body.resource === 'object' && body.resource.order_id) {
      parsedEvent = body.resource.event_code || parsedEvent;
      parsedResourceId = body.resource.order_id;
      parsedMallId = body.resource.mall_id || parsedMallId;
    }

    // 1. 验证事件是否为订单付款完成 (order.paid) 或 订单创建 (order.create / create_order)
    const isValidEvent = (parsedEvent === "order.paid" || parsedEvent === "order.create" || parsedEvent === "create_order") && parsedResourceId;
    if (!isValidEvent) {
      const resLog = typeof body.resource === 'object' ? JSON.stringify(body.resource) : body.resource;
      console.log(`[Cafe24 Webhook] Ignored event: ${parsedEvent} for resource: ${resLog}`);
      return NextResponse.json({ ok: true, message: "Ignored event" });
    }

    const orderId = parsedResourceId;
    console.log(`[Cafe24 Webhook] Processing event ${parsedEvent} for Order ID: ${orderId} (Mall: ${parsedMallId})`);

    // 2. 调用 API 获取完整的订单详情 (包含订单项 items)
    const order = await fetchOrderDetails(parsedMallId, orderId);

    if (!order) {
      throw new Error(`Order ${orderId} details not found on Cafe24.`);
    }

    // 3. 校验订单支付状态 (paid === "T" / N10 결제완료)
    // Cafe24 订单支付状态为 paid: "T"
    const isPaid = order.paid === "T" || (order.items && order.items.some((item: { order_status?: string }) => item.order_status === "N10"));
    if (!isPaid) {
      console.warn(`[Cafe24 Webhook] Order ${orderId} is not fully paid yet. Status: ${order.paid}`);
      return NextResponse.json({ ok: true, message: "Order not paid yet" });
    }

    // 获取购买人联系方式
    const buyerPhone = order.buyer?.cellphone || order.buyer?.phone || "";
    const buyerEmail = order.buyer?.email || "";
    const contact = (buyerPhone || buyerEmail || "Unknown").trim();

    // 4. 遍历订单项目, 寻找我们的升级服务商品 (P00000SE)
    const items = order.items || [];
    let activatedCount = 0;

    for (const item of items) {
      if (item.product_code === TARGET_PRODUCT_CODE) {
        // 提取自定义的 "기기 SN" 选项值
        const optionValue = item.additional_option_value;
        if (!optionValue) {
          console.error(`[Cafe24 Webhook] Target item in Order ${orderId} is missing the device SN option.`);
          continue;
        }

        // 解析 SN 码 (例如 optionValue 可能是 "기기 SN=A01460..." 或 "기기 SN: A01460...")
        let sn = String(optionValue).trim();
        if (sn.includes("=")) {
          sn = sn.substring(sn.indexOf("=") + 1).trim();
        } else if (sn.includes(":")) {
          sn = sn.substring(sn.indexOf(":") + 1).trim();
        }
        sn = sn.toUpperCase();

        if (!sn) {
          console.error(`[Cafe24 Webhook] Parsed SN is empty for option value: ${optionValue}`);
          continue;
        }

        console.log(`[Cafe24 Webhook] Activating SN: ${sn}`);

        // 5. 写入数据库激活状态 (device_feature_upgrades)
        await prisma.device_feature_upgrades.upsert({
          where: { sn },
          update: {
            purchase_status: "paid",
            contact,
            paid_at: new Date(),
            payment_provider: "cafe24",
            updated_at: new Date(),
          },
          create: {
            sn,
            purchase_status: "paid",
            contact,
            paid_at: new Date(),
            payment_provider: "cafe24",
          },
        });

        activatedCount++;
        console.log(`[Cafe24 Webhook] Successfully activated Zigbee feature for SN: ${sn}`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Processed order ${orderId}`,
      activated: activatedCount,
    });
  } catch (error: unknown) {
    console.error("[Cafe24 Webhook] Error processing webhook:", error);
    // 即使出错也返回 500，以让 Cafe24 的 Webhook 机制重试该通知
    return NextResponse.json(
      { error: "WEBHOOK_PROCESSING_FAILED", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
