import { describe, expect, it } from "vitest";
import { DEFAULT_ATTENTION_ALERT_SETTINGS, diffAttentionIds, parseAttentionAlertSettings } from "./attentionAlertStore";

describe("diffAttentionIds", () => {
  it("does not alert on the first check in this browser", () => {
    expect(diffAttentionIds(null, ["a", "b"])).toEqual({ newIds: [], nextKnown: ["a", "b"] });
  });

  it("alerts only ids that were not known", () => {
    expect(diffAttentionIds(["a", "b"], ["c", "a", "b"])).toEqual({ newIds: ["c"], nextKnown: ["c", "a", "b"] });
  });

  it("forgets resolved ids so they alert again if they come back", () => {
    const first = diffAttentionIds(["a", "b"], ["b"]);
    expect(first.newIds).toEqual([]);
    expect(diffAttentionIds(first.nextKnown, ["a", "b"]).newIds).toEqual(["a"]);
  });

  it("alerts a new id even when the total count stays the same", () => {
    expect(diffAttentionIds(["a", "b"], ["b", "c"]).newIds).toEqual(["c"]);
  });
});

describe("parseAttentionAlertSettings", () => {
  it("defaults to both on", () => {
    expect(parseAttentionAlertSettings(null)).toEqual(DEFAULT_ATTENTION_ALERT_SETTINGS);
    expect(parseAttentionAlertSettings("not json")).toEqual(DEFAULT_ATTENTION_ALERT_SETTINGS);
  });

  it("keeps saved values and fills missing ones", () => {
    expect(parseAttentionAlertSettings('{"sound":false}')).toEqual({ sound: false, notification: true });
  });
});
