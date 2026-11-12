import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@unmap/geocoding";
import { displayCase, highlight, resultLines } from "../lib/search-result";

const address = (over: Partial<GeocodeResult> = {}): GeocodeResult => ({
  id: "1",
  name: "108 PATTERSON DR SW, Calgary",
  layer: "address",
  lng: -114.18,
  lat: 51.07,
  address: { housenumber: "108", street: "PATTERSON DR SW", city: "Calgary", region: "AB" },
  ...over,
});

describe("displayCase", () => {
  it("title-cases an all-capitals street and keeps quadrants", () => {
    expect(displayCase("108 PATTERSON DR SW")).toBe("108 Patterson Dr SW");
    expect(displayCase("RUE ST-DENIS")).toBe("Rue St-Denis");
    expect(displayCase("1 RUE DE LA GAUCHETIÈRE")).toBe("1 Rue de la Gauchetière");
    expect(displayCase("17TH AVE SW")).toBe("17th Ave SW");
    expect(displayCase("MCDONALD AVE")).toBe("McDonald Ave");
  });

  it("leaves a name with any lower case exactly as written", () => {
    expect(displayCase("108 Patterson Street")).toBe("108 Patterson Street");
    expect(displayCase("ᐃᖃᓗᐃᑦ")).toBe("ᐃᖃᓗᐃᑦ");
  });
});

describe("resultLines", () => {
  it("puts the address first and the place second, without repeating the city", () => {
    expect(resultLines(address(), "en")).toEqual({ primary: "108 Patterson Dr SW", secondary: "Calgary, AB" });
  });

  it("names a town's province in the reader's language", () => {
    const town = address({ name: "Montréal", layer: "locality", address: { city: "Montréal", region: "QC" } });
    expect(resultLines(town, "en").secondary).toBe("Quebec");
    expect(resultLines(town, "fr").secondary).toBe("Québec");
  });

  it("leads a place's second line with its category", () => {
    const cafe = address({ name: "Phil & Sebastian", layer: "poi", category: "food.cafe", address: { housenumber: "618", street: "Confluence Way SE", city: "Calgary" } });
    expect(resultLines(cafe, "en")).toEqual({ primary: "Phil & Sebastian", secondary: "Coffee, 618 Confluence Way SE, Calgary" });
  });
});

describe("highlight", () => {
  it("marks the start of each word the query starts", () => {
    expect(highlight("108 Patterson Dr SW", "108 patt")).toEqual([
      { text: "108", match: true },
      { text: " ", match: false },
      { text: "Patt", match: true },
      { text: "erson Dr SW", match: false },
    ]);
  });

  it("matches each part of a hyphenated word", () => {
    expect(highlight("Rue Sainte-Catherine", "rue sainte-cath").filter((p) => p.match).map((p) => p.text)).toEqual(["Rue", "Sainte", "Cath"]);
  });

  it("matches without accents", () => {
    expect(highlight("Montréal", "montre")[0]).toEqual({ text: "Montré", match: true });
  });

  it("marks nothing for an empty query", () => {
    expect(highlight("Calgary", "")).toEqual([{ text: "Calgary", match: false }]);
  });
});
