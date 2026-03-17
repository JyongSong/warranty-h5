"use client";

import { useState } from "react";

type ActionState =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type SmsSetting = {
  shop_no?: number;
  use_sms?: string;
  default_sender?: string;
  unsubscribe_phone?: string;
};

export default function Cafe24Actions() {
  const [state, setState] = useState<ActionState>({
    kind: "idle",
    message: "",
  });
  const [smsSetting, setSmsSetting] = useState<SmsSetting | null>(null);
  const [smsSettingError, setSmsSettingError] = useState("");

  async function onSendTestSms() {
    setState({ kind: "loading", message: "테스트 문자를 발송 중입니다..." });

    try {
      const response = await fetch("/api/cafe24/test-sms", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState({
          kind: "error",
          message: data?.error ?? "테스트 문자 발송에 실패했습니다.",
        });
        return;
      }

      const queueCode =
        data && typeof data === "object" && data.result && typeof data.result === "object" &&
        "sms" in data.result &&
        data.result.sms &&
        typeof data.result.sms === "object" &&
        "queue_code" in data.result.sms
          ? String(data.result.sms.queue_code)
          : null;

      setState({
        kind: "success",
        message: queueCode
          ? `테스트 문자를 발송했습니다. queue_code: ${queueCode}`
          : "테스트 문자를 발송했습니다.",
      });
    } catch {
      setState({
        kind: "error",
        message: "테스트 문자 발송에 실패했습니다.",
      });
    }
  }

  async function onLoadSmsSetting() {
    setSmsSettingError("");

    try {
      const response = await fetch("/api/cafe24/sms-setting");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setSmsSetting(null);
        setSmsSettingError(data?.error ?? "SMS 설정 조회에 실패했습니다.");
        return;
      }

      const setting =
        data && typeof data === "object" && "sms_setting" in data && data.sms_setting
          ? (data.sms_setting as SmsSetting)
          : (data as SmsSetting);

      setSmsSetting(setting);
    } catch {
      setSmsSetting(null);
      setSmsSettingError("SMS 설정 조회에 실패했습니다.");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-3">
        <a
          href="/api/cafe24/authorize"
          className="rounded-full bg-[#173045] px-5 py-3 text-sm font-semibold text-white"
        >
          Cafe24 연결 시작
        </a>
        <a
          href="/api/cafe24/status"
          className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700"
        >
          상태 JSON 보기
        </a>
        <button
          type="button"
          onClick={onSendTestSms}
          disabled={state.kind === "loading"}
          className="rounded-full border border-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "loading" ? "발송 중..." : "테스트 문자 발송"}
        </button>
        <button
          type="button"
          onClick={onLoadSmsSetting}
          className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700"
        >
          SMS 설정 보기
        </button>
      </div>

      <div className="mt-3 text-sm text-zinc-600">
        테스트 대상: <strong>01091703550</strong> / 내용:{" "}
        <strong>비대면 배송 안내 문구</strong>
      </div>

      {state.kind !== "idle" ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            state.kind === "error"
              ? "bg-red-50 text-red-700"
              : state.kind === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-700"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      {smsSettingError ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {smsSettingError}
        </div>
      ) : null}

      {smsSetting ? (
        <div className="mt-4 rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-800">
          <div className="mb-3 text-base font-semibold text-zinc-900">SMS setting</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-zinc-500">use_sms</span>: {smsSetting.use_sms ?? "-"}
            </div>
            <div>
              <span className="text-zinc-500">default_sender</span>: {smsSetting.default_sender ?? "-"}
            </div>
            <div>
              <span className="text-zinc-500">unsubscribe_phone</span>: {smsSetting.unsubscribe_phone ?? "-"}
            </div>
            <div>
              <span className="text-zinc-500">shop_no</span>: {smsSetting.shop_no ?? "-"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
