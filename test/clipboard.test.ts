// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/components/ui/toast";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

describe("clipboard feedback", () => {
  it("confirms a successful copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    expect(await copyText("51, -114", "Coordinates copied")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("51, -114");
    expect(toast.add).toHaveBeenCalledWith({ title: "Coordinates copied", type: "success" });
  });

  it.each([false, true])("explains an unavailable or refused clipboard (available: %s)", async (available) => {
    const clipboard = available ? { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } : undefined;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    expect(await copyText("text")).toBe(false);
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't copy", type: "error" }));
  });
});
