"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type RegInfo = {
    snMasked: string;
    installDate: string;
    userPhoneMasked: string;
    status: "submitted" | "confirmed" | "void";
    tokenExpired: boolean;
    confirmedAt?: string | null;
};

export default function ConfirmPage() {
    const sp = useSearchParams();
    const token = sp.get("t") ?? "";

    const [loading, setLoading] = useState(true);
    const [info, setInfo] = useState<RegInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(`/api/registration?t=${encodeURIComponent(token)}`);
            const j = await r.json();
            if (!r.ok) {
                setError(j?.error ?? "加载失败");
                setInfo(null);
                return;
            }
            setInfo(j.data);
        } catch (e: any) {
            setError(e?.message ?? "加载失败");
            setInfo(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!token) {
            setError("缺少确认 token");
            setLoading(false);
            return;
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function onConfirm() {
        if (!token) return;
        setConfirming(true);
        try {
            const r = await fetch("/api/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const j = await r.json();
            if (!r.ok) {
                alert(j?.error ?? "确认失败");
                return;
            }

            // ✅ 不再 load()，因为 confirm 后 token 已被置空
            setInfo((prev) =>
                prev
                    ? {
                        ...prev,
                        status: "confirmed",
                        tokenExpired: true,
                        confirmedAt: new Date().toISOString(),
                    }
                    : prev
            );
        } finally {
            setConfirming(false);
        }
    }

    const canConfirm =
        info &&
        info.status !== "confirmed" &&
        info.status !== "void" &&
        !info.tokenExpired &&
        !confirming;

    return (
        <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                技师确认安装完成
            </h1>

            {loading && <div style={{ opacity: 0.7 }}>加载中...</div>}

            {!loading && error && (
                <div style={{ background: "#fee", padding: 12, borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>无法加载记录</div>
                    <div style={{ fontSize: 14 }}>{error}</div>
                </div>
            )}

            {!loading && info && (
                <div style={{ display: "grid", gap: 10 }}>
                    <InfoCard k="设备 SN" v={info.snMasked} />
                    <InfoCard k="安装日期" v={info.installDate} />
                    <InfoCard k="用户手机号" v={info.userPhoneMasked} />
                    <InfoCard k="当前状态" v={info.status} />

                    {info.tokenExpired && info.status !== "confirmed" && (
                        <div style={{ background: "#fff7e6", padding: 12, borderRadius: 10, fontSize: 14 }}>
                            该确认链接已过期，请让用户重新提交登记或联系售后重发确认链接。
                        </div>
                    )}

                    {info.status === "confirmed" && (
                        <div style={{ background: "#eefaf0", padding: 12, borderRadius: 10, fontSize: 14 }}>
                            已确认完成 ✅
                            {info.confirmedAt ? (
                                <div style={{ marginTop: 6, opacity: 0.8 }}>确认时间：{info.confirmedAt}</div>
                            ) : null}
                        </div>
                    )}

                    <button
                        disabled={!canConfirm}
                        onClick={onConfirm}
                        style={{
                            width: "100%",
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: "none",
                            fontSize: 15,
                            fontWeight: 700,
                            opacity: canConfirm ? 1 : 0.5,
                            cursor: canConfirm ? "pointer" : "not-allowed",
                        }}
                    >
                        {confirming ? "确认中..." : "确认安装完成"}
                    </button>

                    <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
                        点击确认后，该设备的“免费 AS 期限”将按安装日期计算并生效。
                    </div>
                </div>
            )}
        </div>
    );
}

function InfoCard({ k, v }: { k: string; v: string }) {
    return (
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{k}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{v || "-"}</div>
        </div>
    );
}