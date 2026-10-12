// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DirectionsPanel } from "@/components/maps/directions-panel";
import { PlacePanel, landContext } from "@/components/maps/place-panel";
import { unmap } from "@/lib/api";

vi.mock("@/lib/api", () => ({ unmap: {
  places: { get: vi.fn() }, geocoder: { reverse: vi.fn() },
  elevation: { get: vi.fn() }, timezone: { lookup: vi.fn() }, identify: vi.fn(),
  router: { route: vi.fn() },
} }));
vi.mock("@/lib/map-context", () => ({ useMap: () => null }));
vi.mock("@/components/ui/marker-popup", () => ({ Marker: () => null }));
vi.mock("@/components/ui/route-line", () => ({ RouteLine: () => null }));
vi.mock("@/components/ui/elevation-profile", () => ({ ElevationProfile: () => null }));
vi.mock("@/components/ui/geocoder", () => ({ Geocoder: () => null }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(unmap.geocoder.reverse).mockResolvedValue([]);
  vi.mocked(unmap.elevation.get).mockRejectedValue(new Error("Elevation offline"));
  vi.mocked(unmap.timezone.lookup).mockResolvedValue({ timezone: null, offset: null, offsetSeconds: null, dst: null });
  vi.mocked(unmap.identify).mockResolvedValue({ results: [], at: [-114, 51] } as never);
});

const panel = { sheet: "half" as const, onSheet: vi.fn(), onClose: vi.fn() };

describe("panel failures", () => {
  it("explains an unavailable direction point instead of asking for an already chosen endpoint", async () => {
    vi.mocked(unmap.places.get).mockRejectedValue(new Error("Place unavailable"));
    render(<DirectionsPanel {...panel} from={{ place: "um:place:missing" }} to={{ at: [-114, 51] }} mode="auto" hills={0.5} avoid={[]} lang="en" onChange={vi.fn()} padding={() => ({ top: 0, bottom: 0, left: 0, right: 0 })} />);
    expect(await screen.findByText("Couldn't find a trip point")).toBeTruthy();
    expect(screen.queryByText("Add the other end of the trip.")).toBeNull();
    expect(screen.getByLabelText("Starting point").getAttribute("aria-invalid")).toBe("true");
    expect(unmap.router.route).not.toHaveBeenCalled();
  });

  it("ends the terrain loading state when elevation is unavailable", async () => {
    vi.mocked(unmap.places.get).mockResolvedValue({ data: { id: "um:place:1", name: "Test café", coordinates: [-114, 51], category: "food.cafe" } } as never);
    render(<PlacePanel {...panel} id="um:place:1" lang="en" onLoaded={vi.fn()} actions={() => ({ onDirections: vi.fn(), onReach: vi.fn(), onNearby: vi.fn(), onScore: vi.fn(), onShare: vi.fn() })} />);
    expect(await screen.findByText("Elevation profile unavailable here.")).toBeTruthy();
    expect(screen.getByText("Some map details are unavailable")).toBeTruthy();
    expect(screen.getByText("No survey grid here")).toBeTruthy();
  });

  it("distinguishes a failed survey request from a location with no grid", async () => {
    vi.mocked(unmap.identify).mockRejectedValue(new Error("Service offline"));
    const context = await landContext([-114, 51], "en", new AbortController().signal);
    expect(context.survey).toBeNull();
    expect(context.unavailable).toContain("Legal land grid");
  });

  it("keeps the add-on notice separate from failed map details", async () => {
    vi.mocked(unmap.identify).mockImplementation(async ({ layers }) => {
      if (layers?.includes("survey.dls")) throw { status: 403 };
      return { results: [], at: [-114, 51] } as never;
    });
    const context = await landContext([-114, 51], "en", new AbortController().signal);
    expect(context.survey).toBe("addon");
    expect(context.unavailable).not.toContain("Legal land grid");
  });
});
