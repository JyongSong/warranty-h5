import dispatcherConfig from "@/lib/installation/installer/dispatcher-config.json";
import { prisma } from "@/lib/prisma";

type DispatcherConfigSpec = typeof dispatcherConfig;
type DispatcherLimitName = keyof DispatcherConfigSpec["limits"];

type SystemSettingRow = {
  key: string;
  value: string;
};

export type InstallationDispatcherLimits = Record<DispatcherLimitName, number>;

export type InstallationDispatcherConfig = {
  enabled: boolean;
  customerInputRequestMode: "auto" | "manual";
  lockTtlMs: number;
  limits: InstallationDispatcherLimits;
};

export type InstallationDispatcherConfigRow = {
  key: string;
  value: string;
  description: string;
};

const limitEntries = Object.entries(dispatcherConfig.limits) as Array<
  [DispatcherLimitName, DispatcherConfigSpec["limits"][DispatcherLimitName]]
>;

export const INSTALLATION_DISPATCHER_CONFIG_KEYS = [
  dispatcherConfig.enabled.key,
  dispatcherConfig.lockTtlMs.key,
  dispatcherConfig.customerInputRequestMode.key,
  ...limitEntries.map(([, spec]) => spec.key),
] as const;

export async function loadInstallationDispatcherConfig(): Promise<InstallationDispatcherConfig> {
  const rows = await prisma.backofficeSetting.findMany({
    where: {
      key: {
        in: [...INSTALLATION_DISPATCHER_CONFIG_KEYS],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });
  const values = new Map((rows as SystemSettingRow[]).map((row) => [row.key, row.value]));

  return {
    enabled: values.get(dispatcherConfig.enabled.key) === "true",
    customerInputRequestMode: readCustomerInputRequestMode(
      values.get(dispatcherConfig.customerInputRequestMode.key),
    ),
    lockTtlMs: readBoundedInteger(
      values.get(dispatcherConfig.lockTtlMs.key),
      dispatcherConfig.lockTtlMs.default,
      dispatcherConfig.lockTtlMs.min,
      dispatcherConfig.lockTtlMs.max,
    ),
    limits: Object.fromEntries(
      limitEntries.map(([name, spec]) => [
        name,
        readBoundedInteger(values.get(spec.key), spec.default, spec.min, spec.max),
      ]),
    ) as InstallationDispatcherLimits,
  };
}

export function getInstallationDispatcherConfigRows(
  config: InstallationDispatcherConfig,
): InstallationDispatcherConfigRow[] {
  return [
    {
      key: dispatcherConfig.customerInputRequestMode.key,
      value: config.customerInputRequestMode,
      description: dispatcherConfig.customerInputRequestMode.description,
    },
    {
      key: dispatcherConfig.lockTtlMs.key,
      value: String(config.lockTtlMs),
      description: dispatcherConfig.lockTtlMs.description,
    },
    ...limitEntries.map(([name, spec]) => ({
      key: spec.key,
      value: String(config.limits[name]),
      description: spec.description,
    })),
  ];
}

export function getInstallationDispatcherConfigDescription(key: string) {
  if (key === dispatcherConfig.enabled.key) return dispatcherConfig.enabled.description;
  if (key === dispatcherConfig.lockTtlMs.key) return dispatcherConfig.lockTtlMs.description;
  if (key === dispatcherConfig.customerInputRequestMode.key) {
    return dispatcherConfig.customerInputRequestMode.description;
  }

  return limitEntries.find(([, spec]) => spec.key === key)?.[1].description ?? null;
}

function readCustomerInputRequestMode(value: string | undefined): "auto" | "manual" {
  if (value === "auto") return "auto";
  if (value === "manual") return "manual";
  return dispatcherConfig.customerInputRequestMode.default as "manual";
}

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}
