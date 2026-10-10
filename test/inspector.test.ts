// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { abridge, clearCalls, curlOf, describeCall, groupCalls, installRecorder, isRecorded, subscribe, type ApiCall } from "@/lib/inspector";

const GATEWAY = "https://api.unmap.dev";
const call = (path: string, params: [string, string][] = [], extra: Partial<ApiCall> = {}): ApiCall => ({
  id: 1,
  method: "GET",
  path,
  params,
  startedAt: 0,
  status: 200,
  ms: 10,
  ...extra,
});

describe("which requests are listed", () => {
  const gw = new URL(GATEWAY);
  it("lists API calls and skips tile-like bytes", () => {
    expect(isRecorded(new URL(`${GATEWAY}/geocode/autocomplete?q=a`), gw)).toBe(true);
    expect(isRecorded(new URL(`${GATEWAY}/styles/base.json`), gw)).toBe(true);
    expect(isRecorded(new URL(`${GATEWAY}/tiles/14/3000/5000`), gw)).toBe(false);
    expect(isRecorded(new URL(`${GATEWAY}/glyphs/v1/Noto/0-255.pbf`), gw)).toBe(false);
    expect(isRecorded(new URL(`${GATEWAY}/layers/treaties/8/40/80`), gw)).toBe(false);
    expect(isRecorded(new URL("https://example.com/geocode/search"), gw)).toBe(false);
  });
});

describe("describeCall", () => {
  it("writes the autocomplete call the geocoder makes", () => {
    const d = describeCall(call("/geocode/autocomplete", [["q", "calgary tow"], ["focus", "-114.06,51.04"], ["limit", "5"]]));
    expect(d.sdk).toBe("await unmap.geocoder.autocomplete('calgary tow', { focus: [-114.06, 51.04], limit: 5 })");
    expect(d.item).toBe("geocoder");
  });

  it("escapes quotes in a query", () => {
    expect(describeCall(call("/geocode/search", [["q", "prince's island"]])).sdk).toBe("await unmap.geocoder.search('prince\\'s island')");
  });

  it("writes a bicycle route with its hill preference", () => {
    const d = describeCall(call("/route", [["from", "-114.06,51.04"], ["to", "-114.07,51.05"], ["mode", "bicycle"], ["use_hills", "0.3"]]));
    expect(d.sdk).toBe("await unmap.router.route(\n  [-114.06, 51.04],\n  [-114.07, 51.05],\n  { mode: 'bicycle', useHills: 0.3 },\n)");
    expect(d.note).toMatch(/elevation model/);
  });

  it("says why driving has no hill option", () => {
    expect(describeCall(call("/route", [["mode", "auto"]])).note).toMatch(/no grade term/);
  });

  it("reads a place id back out of the path", () => {
    expect(describeCall(call("/places/um%3Aplace%3A12")).sdk).toBe("await unmap.places.get('um:place:12')");
  });

  it("does not mistake the nearby endpoint for a place id", () => {
    expect(describeCall(call("/places/nearby", [["category", "food.cafe"]])).title).toBe("Nearby places");
  });

  it("describes a style load as the Map component", () => {
    expect(describeCall(call("/styles/canopy.json", [["mode", "dark"], ["lang", "fr"]])).sdk).toBe('<Map apiKey={key} style="canopy" mode="dark" lang="fr" />');
  });

  it("flags the add-on a survey identify needs", () => {
    expect(describeCall(call("/identify", [["at", "-114,51"], ["layers", "municipalities,survey.dls"]])).note).toMatch(/legal-land add-on/);
  });
});

describe("curlOf", () => {
  it("sends the key as a header, never in the URL", () => {
    const text = curlOf(call("/timezone", [["lon", "-114"], ["lat", "51"]]), GATEWAY);
    expect(text).toBe(`curl "${GATEWAY}/timezone?lon=-114&lat=51" \\\n  -H "Authorization: Bearer $UNMAP_API_KEY"`);
  });
});

describe("groupCalls", () => {
  it("groups calls that started together and reports the slowest", () => {
    const list = [call("/c", [], { id: 3, startedAt: 1000, ms: 30 }), call("/b", [], { id: 2, startedAt: 20, ms: 80 }), call("/a", [], { id: 1, startedAt: 0, ms: 40 })];
    const groups = groupCalls(list);
    expect(groups.map((g) => g.calls.map((c) => c.id))).toEqual([[3], [1, 2]]);
    expect(groups[1]!.ms).toBe(80);
  });

  it("has no wall time while a call is still running", () => {
    expect(groupCalls([call("/a", [], { ms: null })])[0]!.ms).toBeNull();
  });
});

describe("abridge", () => {
  it("cuts long arrays and geometry", () => {
    expect(abridge([1, 2, 3, 4, 5])).toEqual([1, 2, 3, "… 2 more"]);
    expect(abridge({ coordinates: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]] })).toEqual({ coordinates: "[… 5 positions]" });
  });
});

describe("installRecorder", () => {
  afterEach(() => clearCalls());

  it("records gateway calls without the key and passes everything through", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
    window.fetch = fake as unknown as typeof fetch;
    const uninstall = installRecorder(GATEWAY);
    let latest: readonly ApiCall[] = [];
    const stop = subscribe((c) => (latest = c));

    const res = await window.fetch(`${GATEWAY}/timezone?key=um_test_secret&lon=-114&lat=51`);
    expect(await res.json()).toEqual({ ok: true });
    await window.fetch("https://example.com/other");
    await new Promise((r) => setTimeout(r, 0));

    expect(fake).toHaveBeenCalledTimes(2);
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ path: "/timezone", params: [["lon", "-114"], ["lat", "51"]], status: 200, result: { ok: true } });
    expect(JSON.stringify(latest)).not.toContain("um_test_secret");
    stop();
    uninstall();
  });
});
