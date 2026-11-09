"use client";

import { useReducer, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  canUseBrowserNotification,
  playAttentionAlertSound,
  setAttentionAlertSettings,
  useAttentionAlertSettings,
} from "../../attentionAlertStore";

type PermissionState = NotificationPermission | "unsupported" | "unknown";

export default function AttentionAlertSettingsPanel() {
  const settings = useAttentionAlertSettings();
  // 권한은 브라우저가 들고 있는 값이라 요청 뒤에 다시 읽도록 화면만 갱신한다.
  const [, refreshPermission] = useReducer((value: number) => value + 1, 0);
  const permission = useSyncExternalStore<PermissionState>(subscribeNothing, readPermission, () => "unknown");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  function setPermission() {
    refreshPermission();
  }

  async function toggleNotification(next: boolean) {
    setAttentionAlertSettings({ notification: next });
    if (next && canUseBrowserNotification() && Notification.permission === "default") {
      await Notification.requestPermission();
      setPermission();
    }
  }

  async function runTest() {
    setTestMessage(null);
    const messages: string[] = [];

    if (settings.sound) {
      messages.push((await playAttentionAlertSound()) ? "알림음 재생됨" : "알림음 재생 실패 (브라우저가 소리를 막음)");
    }

    if (settings.notification) {
      if (!canUseBrowserNotification()) {
        messages.push("이 브라우저는 알림을 지원하지 않습니다");
      } else {
        let current = Notification.permission;
        if (current === "default") current = await Notification.requestPermission();
        setPermission();
        if (current === "granted") {
          new Notification("처리 필요/예외 신규 1건 (테스트)", {
            body: "알림이 이렇게 표시됩니다.",
            icon: "/icon.png",
            tag: "backoffice-attention-test",
          });
          messages.push("브라우저 알림 표시됨");
        } else {
          messages.push("브라우저 알림이 차단되어 있습니다");
        }
      }
    }

    setTestMessage(messages.length ? messages.join(" · ") : "알림음과 브라우저 알림이 모두 꺼져 있습니다");
  }

  return (
    <section className="max-w-2xl space-y-6" aria-label="처리 필요 알림 설정">
      <p className="text-sm leading-6 text-zinc-600">
        설치 업무 큐에 <span className="font-semibold text-zinc-900">처리 필요/예외</span> 건이 새로 생기면 알려 줍니다.
        백오피스 화면이 열려 있는 동안 30초마다 확인합니다 (다른 탭을 보고 있어도 됩니다).
        설정은 이 브라우저에만 저장됩니다.
      </p>

      <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
        <SettingRow
          title="알림음"
          description="신규 건이 생기면 소리를 냅니다. 페이지를 한 번 이상 클릭해야 브라우저가 소리를 허용합니다."
          checked={settings.sound}
          onChange={(next) => setAttentionAlertSettings({ sound: next })}
        />
        <SettingRow
          title="브라우저 알림"
          description="화면 구석에 알림을 띄웁니다. 알림을 누르면 처리 필요/예외 목록으로 이동합니다."
          checked={settings.notification}
          onChange={(next) => void toggleNotification(next)}
          footer={
            settings.notification ? (
              <PermissionNotice
                permission={permission}
                onRequest={() => void Notification.requestPermission().then(() => setPermission())}
              />
            ) : null
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runTest()}
          className="h-9 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
        >
          테스트
        </button>
        {testMessage ? <span className="text-sm text-zinc-600">{testMessage}</span> : null}
      </div>
    </section>
  );
}

function subscribeNothing() {
  return () => {};
}

function readPermission(): PermissionState {
  return canUseBrowserNotification() ? Notification.permission : "unsupported";
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
  footer,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-950">{title}</div>
          <div className="mt-1 text-sm leading-5 text-zinc-600">{description}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={() => onChange(!checked)}
          className={[
            "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
            checked ? "bg-slate-900" : "bg-zinc-300",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "inline-block size-5 rounded-full bg-white shadow transition",
              checked ? "translate-x-5" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

function PermissionNotice({ permission, onRequest }: { permission: PermissionState; onRequest: () => void }) {
  if (permission === "granted" || permission === "unknown") return null;
  if (permission === "unsupported") {
    return <p className="text-xs text-amber-700">이 브라우저는 알림을 지원하지 않습니다.</p>;
  }
  if (permission === "denied") {
    return (
      <p className="text-xs text-amber-700">
        브라우저에서 이 사이트의 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꿔 주세요.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onRequest}
      className="text-xs font-semibold text-slate-900 underline underline-offset-2"
    >
      브라우저 알림 권한 허용하기
    </button>
  );
}
