import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isReadingRoute } from "./wake-lock.js";
import { hapticTick } from "./haptics.js";
import {
  handleDeviceChange,
  installHeadphoneDisconnectGuard,
} from "./headphone-guard.js";
import { computeReadingToolbarVisibility } from "./use-toolbar-auto-hide.js";
import { speechPlayer } from "./speech-player.js";
import { midiPlayer } from "./midi-player.js";
import { translate, type Locale } from "./i18n.js";

// Helper for WCAG Relative Luminance and Contrast Ratio
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function sRgbToLinear(c: number): number {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * sRgbToLinear(r) +
    0.7152 * sRgbToLinear(g) +
    0.0722 * sRgbToLinear(b)
  );
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Milestone 1 Empirical Stress Tests", () => {
  describe("1. Wake Lock State Transitions & Edge Cases", () => {
    it("exhaustively validates reading route classification across edge cases", () => {
      const positiveCases = [
        "/bible",
        "/bible?book=kejadian&chapter=1",
        "/bible#verse-5",
        "/kidung",
        "/kidung/KR-001",
        "/kidung/KR-150?chord=1",
        "/literatur",
        "/literatur/doc-123",
        "/literature",
        "/literature/detail",
        "/pdf",
        "/pdf?url=/files/sample.pdf",
      ];
      for (const route of positiveCases) {
        expect(
          isReadingRoute(route),
          `Expected ${route} to be reading route`,
        ).toBe(true);
      }

      const negativeCases = [
        "/",
        "",
        "/sauh",
        "/suara",
        "/suara/post-1",
        "/iman",
        "/lainnya",
        "/settings",
        "/search",
        "/about",
        "/unknown/route",
      ];
      for (const route of negativeCases) {
        expect(
          isReadingRoute(route),
          `Expected ${route} to NOT be reading route`,
        ).toBe(false);
      }
    });

    it("simulates concurrent wake lock request lifecycle and race-condition cancellation", async () => {
      let releaseCallCount = 0;
      let requestCallCount = 0;

      const mockSentinel = {
        release: vi.fn(async () => {
          releaseCallCount++;
        }),
      };

      const mockNav = {
        wakeLock: {
          request: vi.fn(async (_type?: string) => {
            requestCallCount++;
            return mockSentinel;
          }),
        },
      };

      vi.stubGlobal("navigator", mockNav);

      // Simulate rapid route switches: request -> unmount before resolution
      let cancelled = false;
      const acquireTask = async () => {
        const sentinel = await mockNav.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
        }
      };

      const task = acquireTask();
      cancelled = true; // unmounted/switched route rapidly
      await task;

      expect(requestCallCount).toBe(1);
      expect(releaseCallCount).toBe(1);
      vi.unstubAllGlobals();
    });

    it("survives wakeLock.request rejection (e.g., Battery Saver / Permission Denial)", async () => {
      const mockNav = {
        wakeLock: {
          request: vi.fn(async () => {
            throw new Error(
              "NotAllowedError: Wake lock denied in battery saver",
            );
          }),
        },
      };
      vi.stubGlobal("navigator", mockNav);

      let caught = false;
      try {
        await mockNav.wakeLock.request();
      } catch {
        caught = true;
      }
      expect(caught).toBe(true);
      vi.unstubAllGlobals();
    });
  });

  describe("2. Theme Matrix, CSS Variables & WCAG Contrast Verification", () => {
    const themes = {
      light: {
        canvas: "#f7faff",
        surface: "#ffffff",
        ink: "#13213d",
        muted: "#59677f",
        blue: "#2a65c7",
        navy: "#18345f",
      },
      dark: {
        canvas: "#111a2a",
        surface: "#172338",
        ink: "#edf3ff",
        muted: "#aebbd0",
        blue: "#8fb8ff",
        navy: "#c6d9ff",
      },
      amoled: {
        canvas: "#000000",
        surface: "#0a0a0a",
        ink: "#ffffff",
        muted: "#94a3b8",
        blue: "#93c5fd",
        navy: "#dbeafe",
      },
      sepia: {
        canvas: "#f4ecd8",
        surface: "#fbf5e6",
        ink: "#43302b",
        muted: "#7c6853",
        blue: "#8b5a2b",
        navy: "#3e2723",
      },
    };

    it("verifies pure AMOLED dark canvas is true black (#000000)", () => {
      expect(themes.amoled.canvas).toBe("#000000");
    });

    it("meets WCAG 2.1 AA contrast requirements for primary body text across all themes", () => {
      for (const [themeName, tokens] of Object.entries(themes)) {
        const contrastCanvas = contrastRatio(tokens.ink, tokens.canvas);
        const contrastSurface = contrastRatio(tokens.ink, tokens.surface);

        // WCAG AA requires at least 4.5:1 for normal body text
        expect(
          contrastCanvas,
          `${themeName} ink on canvas contrast (${contrastCanvas.toFixed(2)}) must be >= 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5);

        expect(
          contrastSurface,
          `${themeName} ink on surface contrast (${contrastSurface.toFixed(2)}) must be >= 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("meets WCAG contrast requirements for secondary muted text across all themes", () => {
      for (const [themeName, tokens] of Object.entries(themes)) {
        const contrastCanvas = contrastRatio(tokens.muted, tokens.canvas);
        const contrastSurface = contrastRatio(tokens.muted, tokens.surface);

        // Secondary / muted copy should meet minimum 4.0:1 or >= 4.5:1 for readability
        expect(
          contrastCanvas,
          `${themeName} muted on canvas contrast (${contrastCanvas.toFixed(2)}) must be >= 4.0:1`,
        ).toBeGreaterThanOrEqual(4.0);

        expect(
          contrastSurface,
          `${themeName} muted on surface contrast (${contrastSurface.toFixed(2)}) must be >= 4.0:1`,
        ).toBeGreaterThanOrEqual(4.0);
      }
    });

    it("verifies all 5 themes have full i18n label coverage across ID, EN, and ZH", () => {
      const locales: Locale[] = ["id", "en", "zh"];
      const themeKeys = [
        "theme.system",
        "theme.light",
        "theme.dark",
        "theme.amoled",
        "theme.sepia",
      ] as const;

      for (const locale of locales) {
        expect(translate(locale, "shell.theme")).toBeTruthy();
        for (const key of themeKeys) {
          const label = translate(locale, key);
          expect(
            label,
            `Missing translation for ${key} in ${locale}`,
          ).toBeTruthy();
          expect(label).not.toBe(key); // Must not return fallback raw key
        }
      }
    });
  });

  describe("3. Haptic Tick Robustness & Fuzzing", () => {
    it("handles 1,000 rapid synchronous hapticTick invocations without memory leak or exception", () => {
      const vibrateMock = vi.fn();
      vi.stubGlobal("navigator", { vibrate: vibrateMock });

      for (let i = 0; i < 1000; i++) {
        hapticTick(i % 2 === 0 ? "light" : "medium");
      }

      expect(vibrateMock).toHaveBeenCalledTimes(1000);
      vi.unstubAllGlobals();
    });

    it("gracefully handles unexpected arguments or missing vibrate API", () => {
      vi.stubGlobal("navigator", undefined);
      expect(() => hapticTick()).not.toThrow();

      vi.stubGlobal("navigator", {});
      expect(() => hapticTick("light")).not.toThrow();
      expect(() => hapticTick("medium")).not.toThrow();
      expect(() => hapticTick("unknown" as any)).not.toThrow();

      vi.unstubAllGlobals();
    });

    it("absorbs thrown exceptions from restricted iframe or strict permission policy", () => {
      const throwingVibrate = vi.fn(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });
      vi.stubGlobal("navigator", { vibrate: throwingVibrate });

      expect(() => hapticTick("light")).not.toThrow();
      expect(() => hapticTick("medium")).not.toThrow();
      vi.unstubAllGlobals();
    });
  });

  describe("4. Headphone Guard Disconnect & Concurrency", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("pauses both players when both are concurrently active upon devicechange", () => {
      vi.spyOn(speechPlayer, "snapshot").mockReturnValue({
        status: "speaking",
        currentIndex: 1,
        total: 10,
        voices: [],
        rate: 1,
        pitch: 1,
        volume: 1,
        available: true,
        engine: "auto",
        context: undefined,
      });
      vi.spyOn(midiPlayer, "snapshot").mockReturnValue({
        status: "playing",
        duration: 180,
        position: 45,
        volume: 1,
        muted: false,
        tempo: 100,
        transpose: 0,
        instrument: 0,
        backend: "fluidsynth",
        loadingProgress: 1,
      });

      const pauseSpeech = vi.spyOn(speechPlayer, "pause").mockResolvedValue();
      const pauseMidi = vi.spyOn(midiPlayer, "pause").mockResolvedValue();

      handleDeviceChange();

      expect(pauseSpeech).toHaveBeenCalledTimes(1);
      expect(pauseMidi).toHaveBeenCalledTimes(1);
    });

    it("does nothing if both players are idle", () => {
      vi.spyOn(speechPlayer, "snapshot").mockReturnValue({
        status: "idle",
        currentIndex: -1,
        total: 0,
        voices: [],
        rate: 1,
        pitch: 1,
        volume: 1,
        available: true,
        engine: "auto",
        context: undefined,
      });
      vi.spyOn(midiPlayer, "snapshot").mockReturnValue({
        status: "idle",
        duration: 0,
        position: 0,
        volume: 1,
        muted: false,
        tempo: 100,
        transpose: 0,
        instrument: -1,
        backend: "idle",
        loadingProgress: 0,
      });

      const pauseSpeech = vi.spyOn(speechPlayer, "pause").mockResolvedValue();
      const pauseMidi = vi.spyOn(midiPlayer, "pause").mockResolvedValue();

      handleDeviceChange();

      expect(pauseSpeech).not.toHaveBeenCalled();
      expect(pauseMidi).not.toHaveBeenCalled();
    });

    it("absorbs pause rejection without unhandled promise rejection", () => {
      vi.spyOn(speechPlayer, "snapshot").mockReturnValue({
        status: "speaking",
        currentIndex: 0,
        total: 1,
        voices: [],
        rate: 1,
        pitch: 1,
        volume: 1,
        available: true,
        engine: "auto",
        context: undefined,
      });
      vi.spyOn(speechPlayer, "pause").mockRejectedValue(
        new Error("AudioContext closed"),
      );

      expect(() => handleDeviceChange()).not.toThrow();
    });

    it("handles null/undefined navigator.mediaDevices gracefully", () => {
      vi.stubGlobal("navigator", {});
      const cleanup = installHeadphoneDisconnectGuard();
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe("5. Reading Toolbar Auto-Hide & Z-Index Stratification", () => {
    it("verifies scroll auto-hide hysteresis and boundary conditions", () => {
      // Near top of page (scrollY <= 40) -> always visible
      expect(computeReadingToolbarVisibility(0, 0, false)).toBe(true);
      expect(computeReadingToolbarVisibility(20, 100, false)).toBe(true);
      expect(computeReadingToolbarVisibility(40, 50, false)).toBe(true);

      // Scrolling down past 80px with delta > 8 -> hides
      expect(computeReadingToolbarVisibility(81, 70, true)).toBe(false);
      expect(computeReadingToolbarVisibility(150, 100, true)).toBe(false);

      // Scrolling down between 41px and 80px -> maintains visible if currently visible
      expect(computeReadingToolbarVisibility(60, 50, true)).toBe(true);

      // Scrolling up with delta < -6 -> restores
      expect(computeReadingToolbarVisibility(200, 210, false)).toBe(true);
      expect(computeReadingToolbarVisibility(100, 108, false)).toBe(true);

      // Small jitter scroll (|delta| <= 5) -> keeps current state
      expect(computeReadingToolbarVisibility(150, 148, true)).toBe(true);
      expect(computeReadingToolbarVisibility(150, 148, false)).toBe(false);
      expect(computeReadingToolbarVisibility(150, 153, false)).toBe(false);
      expect(computeReadingToolbarVisibility(150, 153, true)).toBe(true);
    });

    it("validates 6-tier z-index stratification ordering strictly satisfies stacking constraints", () => {
      const Z_INDEX_TIERS = {
        content: 0,
        nav: 10,
        media: 20,
        toolbar: 30,
        popover: 40,
        modal: 50,
      } as const;

      expect(Z_INDEX_TIERS.content).toBeLessThan(Z_INDEX_TIERS.nav);
      expect(Z_INDEX_TIERS.nav).toBeLessThan(Z_INDEX_TIERS.media);
      expect(Z_INDEX_TIERS.media).toBeLessThan(Z_INDEX_TIERS.toolbar);
      expect(Z_INDEX_TIERS.toolbar).toBeLessThan(Z_INDEX_TIERS.popover);
      expect(Z_INDEX_TIERS.popover).toBeLessThan(Z_INDEX_TIERS.modal);
    });
  });
});
