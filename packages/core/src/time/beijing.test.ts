import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  buildDateRangeFilterInBeijing,
  formatDateInBeijing,
  formatDateTimeInBeijing,
  formatInBeijing,
  formatTimeInBeijing,
  getBeijingTimeZone,
  getCompactDateStampInBeijing,
  getDateKeyInBeijing,
  getDayRangeInBeijing,
  getTimeZoneOffsetMs,
  getTodayRangeInBeijing,
  getUtcMsForZonedDayStart,
  parseDateKey,
} from "./beijing";

describe("Beijing time helpers", () => {
  const sample = new Date("2026-06-22T16:30:05Z");

  it("formats valid inputs in the Beijing timezone and keeps fallbacks for invalid inputs", () => {
    expect(getBeijingTimeZone()).toBe("Asia/Shanghai");
    expect(formatInBeijing(sample, { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("00:30");
    expect(formatDateTimeInBeijing(null, {}, "fallback")).toBe("fallback");
    expect(formatDateInBeijing("bad-date", {}, "bad")).toBe("bad");
    expect(formatTimeInBeijing(sample)).toBe("00:30");
  });

  it("normalizes Beijing date keys and date arithmetic", () => {
    expect(getDateKeyInBeijing(sample)).toBe("2026-06-23");
    expect(getCompactDateStampInBeijing(sample)).toBe("20260623");
    expect(parseDateKey(" 2026-06-23 ")).toBe("2026-06-23");
    expect(parseDateKey("2026-6-23")).toBeNull();
    expect(parseDateKey(null)).toBeNull();
    expect(addDaysToDateKey("2026-06-23", 2)).toBe("2026-06-25");
    expect(addDaysToDateKey("not-a-date", 2)).toBe("not-a-date");
  });

  it("builds UTC day ranges for Beijing calendar days", () => {
    expect(getTimeZoneOffsetMs(new Date("2026-06-23T00:00:00Z"))).toBe(8 * 60 * 60 * 1000);
    expect(new Date(getUtcMsForZonedDayStart("2026-06-23")).toISOString()).toBe("2026-06-22T16:00:00.000Z");
    expect(() => getUtcMsForZonedDayStart("20260623")).toThrow("Invalid date key: 20260623");

    const range = getDayRangeInBeijing("2026-06-23");
    expect(range.start.toISOString()).toBe("2026-06-22T16:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-06-23T16:00:00.000Z");

    expect(buildDateRangeFilterInBeijing({ startDate: "2026-06-23" }).gte?.toISOString()).toBe(
      "2026-06-22T16:00:00.000Z",
    );
    expect(buildDateRangeFilterInBeijing({ endDate: "2026-06-24" }).lt?.toISOString()).toBe(
      "2026-06-24T16:00:00.000Z",
    );

    const today = getTodayRangeInBeijing(sample);
    expect(today).toMatchObject({ dateKey: "2026-06-23" });
    expect(today.start.toISOString()).toBe("2026-06-22T16:00:00.000Z");
  });
});
