import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, unknown>>,
  fields: [] as Array<Record<string, unknown>>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  index: 0,
  values: [] as unknown[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.index++;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [harness.values[index] ?? initial, setter];
    },
    useEffect: (effect: React.EffectCallback) => { effect(); },
  };
});

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    harness.buttons.push(props);
    return React.createElement("button", { disabled: props.disabled }, props.children as React.ReactNode);
  },
}));
vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children),
  CardContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  CardHeader: ({ children }: { children: React.ReactNode }) => React.createElement("header", null, children),
  CardTitle: ({ children }: { children: React.ReactNode }) => React.createElement("h2", null, children),
}));
vi.mock("@subboost/ui/components/ui/password-field", () => ({
  PasswordField: (props: Record<string, unknown>) => {
    harness.fields.push(props);
    return React.createElement("label", null, props.label as string);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => {
    harness.fields.push(props);
    return React.createElement("input", { placeholder: props.placeholder as string });
  },
}));

import { PasswordSettings } from "../../../local/src/components/password-settings";

function render(values: unknown[]) {
  harness.index = 0;
  harness.values = values;
  harness.buttons = [];
  harness.fields = [];
  return renderToStaticMarkup(React.createElement(PasswordSettings, { active: true }));
}

async function flush() { for (let index = 0; index < 5; index++) await Promise.resolve(); }

describe("Cloudflare password settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { href: "" } });
  });

  it("rejects a mismatched confirmation before sending credentials", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ singleAdminLogin: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    render([true, "current-secret", "new-secret-long", "different-secret", ""]);
    await (harness.buttons[0].onClick as () => Promise<void>)();
    expect(harness.setters[6]).toHaveBeenCalledWith("两次新密码不一致");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/password", expect.anything());
  });

  it("accepts password fields and keeps the optional TOTP input numeric", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ singleAdminLogin: true }) })));
    render([true, "", "", "", ""]);
    for (const [index, value] of ["current-secret", "new-secret-long", "new-secret-long"].entries()) {
      (harness.fields[index].onChange as (event: unknown) => void)({ target: { value } });
      expect(harness.setters[index + 1]).toHaveBeenCalledWith(value);
    }
    (harness.fields[3].onChange as (event: unknown) => void)({ target: { value: "12a34567" } });
    expect(harness.setters[4]).toHaveBeenCalledWith("123456");
  });

  it("changes a password and returns to login after the server revokes sessions", async () => {
    const fetchMock = vi.fn(async (url: string) => url === "/api/auth/password"
      ? { ok: true, json: async () => ({ success: true }) }
      : { ok: true, json: async () => ({ singleAdminLogin: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const html = render([true, "current-secret", "new-secret-long", "new-secret-long", "123456"]);
    expect(html).toContain("更换密码");
    await (harness.buttons[0].onClick as () => Promise<void>)();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ currentPassword: "current-secret", newPassword: "new-secret-long", code: "123456" }),
    }));
    expect(window.location.href).toBe("/login");
  });

  it("shows a rejected password change without logging the user out", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/auth/password"
      ? { ok: false, json: async () => ({ error: "Invalid current password or authenticator code." }) }
      : { ok: true, json: async () => ({ singleAdminLogin: true }) }));
    render([true, "wrong-current", "new-secret-long", "new-secret-long", ""]);
    await (harness.buttons[0].onClick as () => Promise<void>)();
    await flush();
    expect(harness.setters[6]).toHaveBeenCalledWith("Invalid current password or authenticator code.");
    expect(window.location.href).toBe("");
  });
});
