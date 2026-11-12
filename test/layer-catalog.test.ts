import { describe, expect, it } from "vitest";
import type { Layer } from "@unmap/sdk";
import { catalogOverlays, jurisdictionLabel, overlayGroups, overlayLabel, previewStyle } from "../lib/layer-catalog";

const layer = (id: string, addon: Layer["addon"], jurisdiction: string[] = ["CA"]): Layer => ({
  id,
  display_name: { en: `${id} en`, fr: `${id} fr` },
  jurisdiction,
  addon,
  licence: "",
  attribution: "",
  coverage: "",
});

describe("overlayGroups", () => {
  const catalog = [layer("energy.wells", "energy", ["CA-AB"]), layer("municipalities", null), layer("survey.dls", "legalLand", ["CA-AB", "CA-SK"]), layer("new.thing", "future" as Layer["addon"])];

  it("lists the app's live layers, then core, then each add-on in a fixed order", () => {
    const groups = overlayGroups(catalog, "en");
    expect(groups.map((g) => g.id)).toEqual(["live", "core", "legalLand", "energy", "future"]);
    expect(groups[0]!.overlays.map((o) => o.id)).toEqual(["transit", "roads"]);
  });

  it("keeps a capability it has no name for, so a new add-on still shows", () => {
    expect(overlayGroups(catalog, "en").at(-1)!.overlays[0]!.id).toBe("new.thing");
  });

  it("reads names in the reader's language", () => {
    expect(overlayGroups(catalog, "fr")[1]!.overlays[0]!.label).toBe("municipalities fr");
  });

  it("lists only the live layers before the catalog loads", () => {
    expect(overlayGroups([], "en").map((g) => g.id)).toEqual(["live"]);
  });
});

it("jurisdictionLabel says Canada for national layers and province codes otherwise", () => {
  expect(jurisdictionLabel(["CA"])).toBe("Canada");
  expect(jurisdictionLabel(["CA-AB", "CA-SK"])).toBe("AB, SK");
});

it("catalogOverlays leaves out the app's own layers", () => {
  expect(catalogOverlays(["transit", "treaties", "roads", "ski"])).toEqual(["treaties", "ski"]);
});

it("overlayLabel falls back to the id until the catalog loads", () => {
  expect(overlayLabel("ski", null, "en")).toBe("ski");
  expect(overlayLabel("ski", [layer("ski", "ski")], "en")).toBe("ski en");
});

it("previewStyle never pictures the style on screen", () => {
  expect(previewStyle("base")).toBe("canopy");
  expect(previewStyle("swiss")).toBe("canopy");
  expect(previewStyle("canopy")).toBe("base");
});
