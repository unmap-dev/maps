import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/use-async";

const refused = (code: string, message: string) => Object.assign(new Error(message), { status: 422, code });

describe("errorMessage", () => {
  it("says a US trip in another mode is car only, from the gateway's message", () => {
    expect(errorMessage(refused("outside_coverage", "US routing is car only: mode must be car or auto (route 422 on /route)"))).toBe(
      "In the US, routing is by car only. Walking, cycling, truck and transit routes cover Canada.",
    );
  });

  it("tells a trip across the border and one between two US metros apart", () => {
    expect(errorMessage(refused("outside_coverage", "routes do not cross the Canada-US border: both ends must be in the same country"))).toMatch(/do not cross the Canada-US border/);
    expect(errorMessage(refused("no_route", "US routing covers ten separate metro areas and does not route between them"))).toMatch(/inside one of the ten metro areas/);
  });

  it("keeps any other gateway message as it came", () => {
    expect(errorMessage(refused("outside_coverage", "outside routing coverage: Canada, and ten US metro areas (see /coverage.json)"))).toBe(
      "outside routing coverage: Canada, and ten US metro areas (see /coverage.json)",
    );
    expect(errorMessage(refused("no_route", "no route found"))).toBe("no route found");
  });
});
