import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draft: "60",
  setter: vi.fn(),
  effect: undefined as (() => void) | undefined,
  input: undefined as any,
  button: undefined as any,
  toggle: undefined as any,
  save: vi.fn(),
  share: vi.fn(),
  guard: vi.fn(),
  store: {
    testInterval: 300,
    sharedHealthChecks: true,
  },
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [mocks.draft, mocks.setter],
  useEffect: (effect: () => void) => {
    mocks.effect = effect;
  },
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => ({
    testInterval: mocks.store.testInterval,
    setTestInterval: mocks.save,
    sharedHealthChecks: mocks.store.sharedHealthChecks,
    setSharedHealthChecks: mocks.share,
  }),
}));
vi.mock("@subboost/ui/store/ui-store", () => ({
  useUnappliedInputGuard: mocks.guard,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.button = props;
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/form-field", () => ({
  FormField: (props: any) => React.createElement("div", null, props.label, props.children, props.error ?? null),
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.input = props;
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: any) => {
    mocks.toggle = props;
    return null;
  },
}));

import { HealthCheckSettings } from "./health-check-settings";

describe("HealthCheckSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.draft = "60";
    mocks.store.testInterval = 300;
    mocks.store.sharedHealthChecks = true;
  });

  it("saves positive integer intervals and exposes the global shared-health-check switch", () => {
    renderToStaticMarkup(React.createElement(HealthCheckSettings));
    mocks.effect?.();
    expect(mocks.setter).toHaveBeenCalledWith("300");
    expect(mocks.guard).toHaveBeenLastCalledWith(true);

    mocks.input.onChange({ target: { value: "30" } });
    expect(mocks.setter).toHaveBeenCalledWith("30");

    mocks.button.onClick();
    expect(mocks.save).toHaveBeenCalledWith(60);

    const preventDefault = vi.fn();
    mocks.input.onKeyDown({ key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(2);

    mocks.toggle.onCheckedChange(false);
    expect(mocks.share).toHaveBeenCalledWith(false);
    expect(mocks.toggle.label).toContain("全局");

    for (const value of ["0", "-1", "1.5", "", "x", "9007199254740992"]) {
      mocks.draft = value;
      renderToStaticMarkup(React.createElement(HealthCheckSettings));
      expect(mocks.button.disabled).toBe(true);
      expect(mocks.guard).toHaveBeenLastCalledWith(true);
    }

    mocks.draft = "300";
    renderToStaticMarkup(React.createElement(HealthCheckSettings));
    expect(mocks.button.disabled).toBe(true);
    expect(mocks.guard).toHaveBeenLastCalledWith(false);
  });
});
