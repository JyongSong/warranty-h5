"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  InstallationSmsTemplatePreview,
  InstallationSmsTemplatePreviewKey,
} from "@/lib/installation/notifications/sms-template-preview";

type Props = {
  templates: InstallationSmsTemplatePreview[];
};

export default function SmsTemplateClient({ templates }: Props) {
  const [selectedKey, setSelectedKey] = useState<InstallationSmsTemplatePreviewKey>(
    templates[0]?.key ?? "customer_reservation_link",
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === selectedKey) ?? templates[0],
    [selectedKey, templates],
  );

  if (!selectedTemplate) {
    return <p className="mt-5 text-sm text-zinc-600">표시할 SMS 템플릿이 없습니다.</p>;
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      <nav aria-label="SMS 템플릿 선택" className="overflow-x-auto">
        <div role="tablist" className="inline-flex min-w-max items-center rounded-lg bg-zinc-100 p-1 text-zinc-500">
          {templates.map((template) => {
            const active = template.key === selectedTemplate.key;

            return (
              <button
                key={template.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedKey(template.key)}
                className={[
                  "inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-950",
                ].join(" ")}
              >
                {template.label}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="rounded-md border border-zinc-200">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">{selectedTemplate.label}</h3>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500">{selectedTemplate.filePath}</p>
        </div>

        <div className="p-5">
          <div className="w-[520px] max-w-full">
            <h4 className="mb-2 text-sm font-semibold text-zinc-950">템플릿 본문</h4>
            <pre className="min-h-[320px] w-full whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-4 font-sans text-sm leading-6 text-zinc-950">
              {renderLinkedText(selectedTemplate.content)}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderLinkedText(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
      >
        {part}
      </a>
    );
  });
}
