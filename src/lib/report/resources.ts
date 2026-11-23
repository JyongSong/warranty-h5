import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { dateRange, pageArgs, type ReportQuery, type ReportRow } from "./query";

// 리포트 API 의 리소스별 조회. 각 함수는 한 페이지의 행과 조건에 맞는 전체 행 수를 돌려준다.
// 정렬은 생성 시각 + id 로 고정해서 페이지를 넘겨도 행이 겹치거나 빠지지 않게 한다.

// piiDecryptFailures: 복호화에 실패해 비워 둔 칸 수. 0 이 아니면 PII_ENCRYPTION_KEY 가 데이터와 맞지 않는다.
export type ReportPage = { rows: ReportRow[]; total: number; piiDecryptFailures?: number };
type Fetcher = (q: ReportQuery) => Promise<ReportPage>;

/** 복호화 실패(키 불일치 등)는 그 칸만 비우고 나머지 행은 그대로 내보내되, 실패 수를 센다. */
function piiDecoder() {
  const decoder = {
    failures: 0,
    pii(value: string | null | undefined): string | null {
      try {
        return decryptNullablePii(value);
      } catch {
        decoder.failures++;
        return null;
      }
    },
  };
  return decoder;
}

function joinAddress(main: string | null, detail: string | null): string | null {
  const parts = [main, detail].map((v) => v?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** INSTALL 정산 라인의 총액을 주문 id 별로 모은다. */
async function installSettlementTotals(orderIds: string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const lines = await prisma.settlementLine.findMany({
    where: { sourceType: "INSTALL", sourceOrderId: { in: orderIds } },
    select: { sourceOrderId: true, totalAmount: true },
  });
  return new Map(lines.map((l) => [l.sourceOrderId, l.totalAmount]));
}

// ─── 설치 주문 ────────────────────────────────────────────────────────────

const fetchInstallationOrders: Fetcher = async (q) => {
  const where = { createdAt: dateRange(q) };
  const [total, orders] = await Promise.all([
    prisma.installationOrder.count({ where }),
    prisma.installationOrder.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        status: true,
        createdAt: true,
        statusChangedAt: true,
        cancelledAt: true,
        cancelReason: true,
        hasOpenIssue: true,
        agentProxy: true,
        partnerStatus: true,
        partnerClaimAmount: true,
        partnerCompletedAt: true,
        partner: { select: { name: true } },
        currentInstallerId: true,
        currentInstaller: { select: { name: true, phone: true } },
        source: {
          select: {
            sourceKey: true,
            channel: true,
            externalOrderNo: true,
            externalOrderDate: true,
            orderNumbers: true,
            dueDate: true,
            memo: true,
            customerNameEncrypted: true,
            phoneEncrypted: true,
            addressEncrypted: true,
          },
        },
        activeCustomerRequest: {
          select: {
            status: true,
            customerNameEncrypted: true,
            customerPhoneEncrypted: true,
            ordererPhoneEncrypted: true,
            installAddressEncrypted: true,
            installAddressDetailEncrypted: true,
            installAddress1Encrypted: true,
            installAddress2Encrypted: true,
            installDate: true,
            installTimeSlot: true,
            customerNote: true,
            customerSubmittedAt: true,
          },
        },
        completion: {
          select: {
            submittedAt: true,
            installEndAt: true,
            reviewStatus: true,
            reviewedAt: true,
            achievedAqaraAppCapability: true,
            wallpadResult: true,
            wallpadBilling: true,
            wallpadBrand: true,
            wallpadModel: true,
            extraClaimAmount: true,
            longDistanceAmount: true,
          },
        },
      },
    }),
  ]);

  const settlement = await installSettlementTotals(orders.map((o) => o.id));
  const decoder = piiDecoder();
  const pii = decoder.pii;

  const rows = orders.map((o) => {
    const req = o.activeCustomerRequest;
    const src = o.source;
    const requestAddress = joinAddress(
      pii(req?.installAddressEncrypted) ?? pii(req?.installAddress1Encrypted),
      pii(req?.installAddressDetailEncrypted) ?? pii(req?.installAddress2Encrypted),
    );
    const c = o.completion;
    return {
      id: o.id,
      erp_order_no: src?.sourceKey ?? null,
      channel: src?.channel ?? null,
      external_order_no: src?.externalOrderNo ?? null,
      external_order_date: src?.externalOrderDate ?? null,
      order_numbers: src?.orderNumbers ?? null,
      due_date: src?.dueDate ?? null,
      status: o.status,
      customer_name: pii(req?.customerNameEncrypted) ?? pii(src?.customerNameEncrypted),
      customer_phone: pii(req?.customerPhoneEncrypted) ?? pii(src?.phoneEncrypted),
      orderer_phone: pii(req?.ordererPhoneEncrypted),
      install_address: requestAddress ?? pii(src?.addressEncrypted),
      source_address: pii(src?.addressEncrypted),
      customer_input_status: req?.status ?? null,
      customer_submitted_at: req?.customerSubmittedAt ?? null,
      install_date: req?.installDate ?? null,
      install_time_slot: req?.installTimeSlot ?? null,
      customer_note: req?.customerNote ?? null,
      memo: src?.memo ?? null,
      installer_id: o.currentInstallerId,
      installer_name: o.currentInstaller?.name ?? null,
      installer_phone: o.currentInstaller?.phone ?? null,
      agent_proxy: o.agentProxy,
      partner_name: o.partner?.name ?? null,
      partner_status: o.partnerStatus,
      partner_claim_amount: o.partnerClaimAmount,
      partner_completed_at: o.partnerCompletedAt,
      has_open_issue: o.hasOpenIssue,
      completion_submitted_at: c?.submittedAt ?? null,
      install_end_at: c?.installEndAt ?? null,
      completion_review_status: c?.reviewStatus ?? null,
      completion_reviewed_at: c?.reviewedAt ?? null,
      aqara_app_capability: c?.achievedAqaraAppCapability ?? null,
      wallpad_result: c?.wallpadResult ?? null,
      wallpad_billing: c?.wallpadBilling ?? null,
      wallpad_brand: c?.wallpadBrand ?? null,
      wallpad_model: c?.wallpadModel ?? null,
      long_distance_amount: c?.longDistanceAmount ?? null,
      extra_claim_amount: c?.extraClaimAmount ?? null,
      settlement_total: settlement.get(o.id) ?? null,
      cancelled_at: o.cancelledAt,
      cancel_reason: o.cancelReason,
      created_at: o.createdAt,
      status_changed_at: o.statusChangedAt,
    };
  });
  return { rows, total, piiDecryptFailures: decoder.failures };
};

// ─── 기사 명단 (정산 계좌 정보는 넣지 않는다) ─────────────────────────────

const fetchInstallers: Fetcher = async (q) => {
  const [total, installers] = await Promise.all([
    prisma.installer.count(),
    prisma.installer.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        name: true,
        phone: true,
        branch: true,
        region: true,
        coverage: true,
        address: true,
        serviceAreas: true,
        capabilities: true,
        aqaraAppCapability: true,
        hasAqaraHubInventory: true,
        active: true,
        isAgent: true,
        inCurrentRoster: true,
        asEmergencyAvailability: true,
        profileConfirmedAt: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        updatedAt: true,
        devices: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
        _count: { select: { currentOrders: true } },
      },
    }),
  ]);

  const rows = installers.map((i) => ({
    id: i.id,
    name: i.name,
    phone: i.phone,
    branch: i.branch,
    region: i.region,
    coverage: i.coverage,
    address: i.address,
    service_areas: i.serviceAreas.join(", "),
    capabilities: i.capabilities.join(", "),
    aqara_app_capability: i.aqaraAppCapability,
    has_aqara_hub_inventory: i.hasAqaraHubInventory,
    active: i.active,
    is_agent: i.isAgent,
    in_current_roster: i.inCurrentRoster,
    as_emergency_availability: i.asEmergencyAvailability,
    app_installed: i.devices.length > 0,
    app_last_seen_at: i.devices[0]?.lastSeenAt ?? null,
    profile_confirmed_at: i.profileConfirmedAt,
    latitude: i.latitude,
    longitude: i.longitude,
    current_order_count: i._count.currentOrders,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }));
  return { rows, total };
};

// ─── 정산 라인 (완료 1건 = 1행) ───────────────────────────────────────────

const fetchSettlementLines: Fetcher = async (q) => {
  const where = { completedAt: dateRange(q) };
  const [total, lines] = await Promise.all([
    prisma.settlementLine.count({ where }),
    prisma.settlementLine.findMany({
      where,
      orderBy: [{ completedAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        sourceType: true,
        sourceOrderId: true,
        completedAt: true,
        installerId: true,
        installer: { select: { name: true } },
        linkageFee: true,
        travelFee: true,
        longDistanceFee: true,
        nightWeekendFee: true,
        serviceFee: true,
        extraClaimFee: true,
        wallpadFee: true,
        wallpadAmount: true,
        totalAmount: true,
        statement: { select: { ym: true, seq: true } },
        createdAt: true,
      },
    }),
  ]);

  // 설치 건은 ERP 주문번호를 붙여 준다 (A/S 는 원본 주문이 없을 수 있다)
  const installIds = lines.filter((l) => l.sourceType === "INSTALL").map((l) => l.sourceOrderId);
  const sources =
    installIds.length === 0
      ? []
      : await prisma.installationOrder.findMany({
          where: { id: { in: installIds } },
          select: { id: true, source: { select: { sourceKey: true } } },
        });
  const erpNo = new Map(sources.map((o) => [o.id, o.source?.sourceKey ?? null]));

  const rows = lines.map((l) => ({
    id: l.id,
    source_type: l.sourceType,
    source_order_id: l.sourceOrderId,
    erp_order_no: erpNo.get(l.sourceOrderId) ?? null,
    completed_at: l.completedAt,
    installer_id: l.installerId,
    installer_name: l.installer.name,
    linkage_fee: l.linkageFee,
    travel_fee: l.travelFee,
    long_distance_fee: l.longDistanceFee,
    night_weekend_fee: l.nightWeekendFee,
    service_fee: l.serviceFee,
    extra_claim_fee: l.extraClaimFee,
    wallpad_fee: l.wallpadFee,
    wallpad_onsite_amount: l.wallpadAmount,
    total_amount: l.totalAmount,
    statement_ym: l.statement?.ym ?? null,
    statement_seq: l.statement?.seq ?? null,
    created_at: l.createdAt,
  }));
  return { rows, total };
};

// ─── 월 정산서 ────────────────────────────────────────────────────────────

const fetchSettlementStatements: Fetcher = async (q) => {
  const where = { createdAt: dateRange(q) };
  const [total, statements] = await Promise.all([
    prisma.settlementStatement.count({ where }),
    prisma.settlementStatement.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        ym: true,
        seq: true,
        installerId: true,
        installer: { select: { name: true } },
        lineCount: true,
        baseAmount: true,
        taxDocType: true,
        vatAmount: true,
        payAmount: true,
        evidenceStatus: true,
        evidenceSubmittedAt: true,
        evidenceReviewedAt: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ]);

  const rows = statements.map((s) => ({
    id: s.id,
    ym: s.ym,
    seq: s.seq,
    installer_id: s.installerId,
    installer_name: s.installer.name,
    line_count: s.lineCount,
    base_amount: s.baseAmount,
    tax_doc_type: s.taxDocType,
    vat_amount: s.vatAmount,
    pay_amount: s.payAmount,
    evidence_status: s.evidenceStatus,
    evidence_submitted_at: s.evidenceSubmittedAt,
    evidence_reviewed_at: s.evidenceReviewedAt,
    paid_at: s.paidAt,
    created_at: s.createdAt,
  }));
  return { rows, total };
};

// ─── 보증 등록 ────────────────────────────────────────────────────────────

const fetchWarrantyRegistrations: Fetcher = async (q) => {
  const where = { submittedAt: dateRange(q) };
  const [total, registrations] = await Promise.all([
    prisma.warrantyRegistration.count({ where }),
    prisma.warrantyRegistration.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        sn: true,
        installType: true,
        installDate: true,
        userPhone: true,
        installerPhone: true,
        status: true,
        freeAsEndDate: true,
        consentPrivacy: true,
        consentMarketing: true,
        submittedAt: true,
        confirmedAt: true,
        confirmedBy: true,
        surveySentAt: true,
      },
    }),
  ]);

  const rows = registrations.map((r) => ({
    id: r.id,
    sn: r.sn,
    install_type: r.installType,
    install_date: r.installDate,
    user_phone: r.userPhone,
    installer_phone: r.installerPhone,
    status: r.status,
    free_as_end_date: r.freeAsEndDate,
    consent_privacy: r.consentPrivacy,
    consent_marketing: r.consentMarketing,
    submitted_at: r.submittedAt,
    confirmed_at: r.confirmedAt,
    confirmed_by: r.confirmedBy,
    survey_sent_at: r.surveySentAt,
  }));
  return { rows, total };
};

// ─── A/S ─────────────────────────────────────────────────────────────────

const fetchAsOrders: Fetcher = async (q) => {
  const where = { createdAt: dateRange(q) };
  const [total, orders] = await Promise.all([
    prisma.asOrder.count({ where }),
    prisma.asOrder.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...pageArgs(q),
      select: {
        id: true,
        status: true,
        customerNameEncrypted: true,
        customerPhoneEncrypted: true,
        addressEncrypted: true,
        symptomCode: true,
        symptomDetail: true,
        orderNo: true,
        originalInstallationOrderId: true,
        memo: true,
        currentInstallerId: true,
        currentInstaller: { select: { name: true } },
        assignedAt: true,
        respondedAt: true,
        installerRejectReason: true,
        resolutionDetail: true,
        serviceFee: true,
        submittedAt: true,
        reviewStatus: true,
        reviewedAt: true,
        statusChangedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const decoder = piiDecoder();
  const pii = decoder.pii;
  const rows = orders.map((a) => ({
    id: a.id,
    status: a.status,
    customer_name: pii(a.customerNameEncrypted),
    customer_phone: pii(a.customerPhoneEncrypted),
    address: pii(a.addressEncrypted),
    symptom_code: a.symptomCode,
    symptom_detail: a.symptomDetail,
    order_no: a.orderNo,
    original_installation_order_id: a.originalInstallationOrderId,
    memo: a.memo,
    installer_id: a.currentInstallerId,
    installer_name: a.currentInstaller?.name ?? null,
    assigned_at: a.assignedAt,
    responded_at: a.respondedAt,
    installer_reject_reason: a.installerRejectReason,
    resolution_detail: a.resolutionDetail,
    service_fee: a.serviceFee,
    submitted_at: a.submittedAt,
    review_status: a.reviewStatus,
    reviewed_at: a.reviewedAt,
    status_changed_at: a.statusChangedAt,
    created_at: a.createdAt,
  }));
  return { rows, total, piiDecryptFailures: decoder.failures };
};

export const REPORT_RESOURCES: Record<string, Fetcher> = {
  "installation-orders": fetchInstallationOrders,
  installers: fetchInstallers,
  "settlement-lines": fetchSettlementLines,
  "settlement-statements": fetchSettlementStatements,
  "warranty-registrations": fetchWarrantyRegistrations,
  "as-orders": fetchAsOrders,
};
