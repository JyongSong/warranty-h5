"use client";

import type { BackofficeJsonEntity, JsonEntityDisplay, JsonEntityKeyValueRow } from "@/lib/backoffice/json-entities";

type JsonEntityBrowserItem = Omit<BackofficeJsonEntity, "value"> & {
  display: JsonEntityDisplay;
};

export default function JsonEntityBrowser({ entities }: { entities: JsonEntityBrowserItem[] }) {
  if (entities.length === 0) {
    return (
      <div>
        <p className="text-sm text-zinc-600">표시할 매핑/라벨 항목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <main className="space-y-8">
        {entities.map((entity) => (
          <section key={entity.id} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-950">{entity.label}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{entity.description}</p>
              <p className="mt-2 break-all font-mono text-xs text-zinc-500">{entity.filePath}</p>
            </div>

            <JsonEntityTable entity={entity} />
          </section>
        ))}
      </main>
    </div>
  );
}

function JsonEntityTable({
  entity,
}: {
  entity: JsonEntityBrowserItem;
}) {
  if (entity.display.kind === "array") {
    return (
      <div className="divide-y divide-zinc-100">
        {entity.display.items.map((item) => (
          <div key={item.id}>
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-500">
              {item.label}
            </div>
            <JsonEntityRows rows={item.rows} />
          </div>
        ))}
      </div>
    );
  }

  return <JsonEntityRows rows={entity.display.rows} />;
}

function JsonEntityRows({ rows }: { rows: JsonEntityKeyValueRow[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-max min-w-full border-collapse text-left text-sm whitespace-nowrap">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
          <tr>
            <th className="w-[36%] border-b border-zinc-200 px-4 py-3">키</th>
            <th className="border-b border-zinc-200 px-4 py-3">값</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
              <td className="align-top px-4 py-3 font-mono text-xs leading-5 text-zinc-700">
                {row.key}
              </td>
              <td className="align-top px-4 py-3 text-sm leading-6 text-zinc-950">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
