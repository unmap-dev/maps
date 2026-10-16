import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, formatUrl, parseUrl, roundLngLat, stripBase, withBase, type AppState } from "@/lib/url-state";

const state = (partial: Partial<AppState>): AppState => ({ view: { name: "map" }, camera: null, prefs: { ...DEFAULT_PREFS }, ...partial });

function roundTrip(s: AppState) {
  const url = formatUrl(s);
  const [path, query = ""] = url.split("?");
  return { url, back: parseUrl(path!, query) };
}

describe("url state", () => {
  it("parses the bare root as the map with no camera", () => {
    expect(parseUrl("/", "")).toEqual(state({}));
  });

  it("reads a Google-style camera", () => {
    expect(parseUrl("/@51.0443,-114.0631,13.5z", "").camera).toEqual({ lat: 51.0443, lng: -114.0631, zoom: 13.5 });
  });

  it("reads the percent-encoded path Workers redirects `@` and `,` to", () => {
    const back = parseUrl("/place/um%3Aplace%3A1/%4051.04%2C-114.06%2C15z", "");
    expect(back.view).toEqual({ name: "place", id: "um:place:1" });
    expect(back.camera).toEqual({ lat: 51.04, lng: -114.06, zoom: 15 });
    expect(parseUrl("/reach/-114.06%2C51.04", "minutes=5").view).toMatchObject({ origin: [-114.06, 51.04] });
  });

  it("ignores a malformed camera rather than throwing", () => {
    expect(parseUrl("/@91,0,10z", "").camera).toBeNull();
    expect(parseUrl("/@abc", "").camera).toBeNull();
  });

  const cases: [string, AppState][] = [
    ["place", state({ view: { name: "place", id: "um:place:4471023" }, camera: { lng: -114.0631, lat: 51.0443, zoom: 15 } })],
    ["here", state({ view: { name: "here", at: [-114.07, 51.05] } })],
    ["dir between a place and a point", state({ view: { name: "dir", from: { place: "um:place:1" }, to: { at: [-114.07, 51.0551] }, mode: "bicycle", hills: 0.3 } })],
    ["dir with an empty end", state({ view: { name: "dir", from: null, to: { place: "um:place:2" }, mode: "auto", avoid: ["tolls"] } })],
    ["nearby", state({ view: { name: "nearby", category: "food.cafe" } })],
    ["reach", state({ view: { name: "reach", origin: [-114.0631, 51.0443], minutes: [5, 10, 15], mode: "pedestrian" } })],
    ["score on foot", state({ view: { name: "score", origin: [-114.0631, 51.0443], mode: "pedestrian" } })],
    ["score by bike", state({ view: { name: "score", origin: [-73.5673, 45.5017], mode: "bicycle" } })],
    ["stop", state({ view: { name: "stop", id: "calgary-transit:6810" } })],
    ["event", state({ view: { name: "event", id: "ab511:cond-1142" } })],
    ["prefs", state({ prefs: { style: "canopy", mapMode: "dark", layers: ["transit", "treaties"], lang: "fr", inspect: false } })],
    ["nearby with its original search point", state({ view: { name: "nearby", category: "food.cafe", near: [-73.5673, 45.5017] }, camera: { lng: -73.58, lat: 45.52, zoom: 15 } })],
    ["nearby as a place's tab", state({ view: { name: "nearby", category: "food.cafe", near: [-114.0631, 51.0443], of: "um:place:4471023" } })],
    ["reach as a dropped pin's tab", state({ view: { name: "reach", origin: [-114.0702, 51.0478], minutes: [5, 10, 15], mode: "pedestrian", of: "pin" } })],
    ["score as a place's tab", state({ view: { name: "score", origin: [-114.0631, 51.0443], mode: "bicycle", of: "um:place:1" } })],
  ];
  for (const [name, s] of cases) {
    it(`round-trips ${name}`, () => {
      expect(roundTrip(s).back).toEqual(s);
    });
  }

  it("drops an `of` that is not a place id or pin", () => {
    expect(parseUrl("/score/-114.06,51.04", "of=%3Cscript%3E").view).toEqual({ name: "score", origin: [-114.06, 51.04], mode: "pedestrian" });
    expect(formatUrl(state({ view: { name: "nearby", category: "food.cafe", near: [-114.0631, 51.0443], of: "um:place:1" } }))).toBe("/nearby/food.cafe?near=-114.0631,51.0443&of=um%3Aplace%3A1");
  });

  it("writes the shapes people recognise", () => {
    expect(formatUrl(cases[0]![1])).toBe("/place/um%3Aplace%3A4471023/@51.0443,-114.0631,15z");
    expect(formatUrl(cases[2]![1])).toBe("/dir/um%3Aplace%3A1/-114.07,51.0551?mode=bicycle&hills=0.3");
    expect(formatUrl(cases[5]![1])).toBe("/reach/-114.0631,51.0443?minutes=5,10,15&mode=pedestrian");
    expect(formatUrl(cases[6]![1])).toBe("/score/-114.0631,51.0443");
    expect(formatUrl(cases[7]![1])).toBe("/score/-73.5673,45.5017?mode=bicycle");
    expect(formatUrl(cases[10]![1])).toBe("/?map=canopy-dark&layers=transit,treaties&lang=fr&inspect=0");
  });

  it("ignores an invalid nearby origin", () => {
    expect(parseUrl("/nearby/food.cafe", "near=-114,95").view).toEqual({ name: "nearby", category: "food.cafe" });
  });

  it("wraps map clicks on repeated world copies into valid coordinates", () => {
    expect(roundLngLat([246, 51])).toEqual([-114, 51]);
    expect(roundLngLat([-474, 51])).toEqual([-114, 51]);
  });

  it("keeps a bare style following the page", () => {
    expect(parseUrl("/", "map=outdoor").prefs).toMatchObject({ style: "outdoor", mapMode: "auto" });
  });

  it("drops an unknown style instead of guessing one", () => {
    expect(parseUrl("/", "map=block").prefs.style).toBe("base");
  });

  it("clamps isochrone bands to the API's limits", () => {
    const v = parseUrl("/reach/-114,51", "minutes=5,500,10,0,15,20,30").view;
    expect(v).toMatchObject({ minutes: [5, 10, 15, 20] });
  });

  it("checks on foot unless the mode is a bike, since a drive is not a 15-minute city", () => {
    expect(parseUrl("/score/-114,51", "mode=auto").view).toEqual({ name: "score", origin: [-114, 51], mode: "pedestrian" });
    expect(parseUrl("/score/nowhere", "").view).toEqual({ name: "map" });
  });

  it("falls back to driving for an unknown travel mode", () => {
    expect(parseUrl("/dir/_/_", "mode=teleport").view).toMatchObject({ mode: "auto" });
  });

  it("lives under a base path when apps.unmap.dev serves it at /maps", () => {
    expect(stripBase("/maps/place/um%3Aplace%3A1/@51.04,-114.06,15z", "/maps")).toBe("/place/um%3Aplace%3A1/@51.04,-114.06,15z");
    expect(stripBase("/maps/", "/maps")).toBe("/");
    expect(stripBase("/maps", "/maps")).toBe("/");
    expect(stripBase("/place/x", "")).toBe("/place/x");
    expect(withBase("/place/x/@51,-114,13z?lang=fr", "/maps")).toBe("/maps/place/x/@51,-114,13z?lang=fr");
    expect(withBase("/?map=outdoor", "/maps")).toBe("/maps/?map=outdoor");
    expect(withBase("/", "/maps")).toBe("/maps/");
    expect(withBase("/", "")).toBe("/");
  });
});
