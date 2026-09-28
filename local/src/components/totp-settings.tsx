"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { PasswordField } from "@subboost/ui/components/ui/password-field";

type Status = { available: boolean; enabled: boolean; pending: boolean };
type Enrollment = { secret: string; uri: string };

export function TotpSettings({ active }: { active: boolean }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(null);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetch("/api/auth/totp", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<Status> : null)
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, [active]);

  const send = async (method: "POST" | "PUT" | "DELETE", body: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/totp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "操作失败，请重试");
      if (method === "POST") {
        setEnrollment({ secret: String(result.secret), uri: String(result.uri) });
        setStatus({ available: true, enabled: false, pending: true });
      } else {
        const enabled = method === "PUT";
        setStatus({ available: true, enabled, pending: false });
        setEnrollment(null);
        setCode("");
        setRecoveryCodes(Array.isArray(result.recoveryCodes) ? result.recoveryCodes.filter((item): item is string => typeof item === "string") : []);
      }
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  if (!status?.available) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-300"><ShieldCheck className="h-5 w-5" /></div>
        <CardTitle className="text-base">动态验证码</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-white/60">{status.enabled ? "已开启。登录时需要密码和验证器中的 6 位动态码，或一枚未使用的恢复码。" : "可选开启 TOTP。启用后会提供一次性恢复码。"}</p>
        {recoveryCodes.length > 0 ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
            <p className="mb-2 text-amber-100">现在保存这些恢复码。每枚只能使用一次，关闭此页面后不会再显示。</p>
            <pre className="select-all whitespace-pre-wrap font-mono text-white">{recoveryCodes.join("\n")}</pre>
            <Button className="mt-3" variant="outline" onClick={() => setRecoveryCodes([])}>已保存</Button>
          </div>
        ) : null}
        {!status.enabled && enrollment ? (
          <div className="space-y-2 rounded-md bg-white/5 p-3 text-sm">
            <p>在验证器中手动添加以下密钥，再输入动态码确认：</p>
            <code className="block break-all select-all font-mono text-indigo-200">{enrollment.secret}</code>
            <a className="text-indigo-300 underline" href={enrollment.uri}>用此设备的验证器打开</a>
          </div>
        ) : null}
        {(status.enabled || !enrollment) ? (
          <PasswordField label="当前密码" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        ) : null}
        {(status.enabled || enrollment) ? (
          <FormField label="6 位动态码">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </FormField>
        ) : null}
        {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
        {status.enabled ? (
          <Button variant="destructive" disabled={busy || !password || code.length !== 6}
            onClick={() => void send("DELETE", { password, code })}>关闭动态验证码</Button>
        ) : enrollment ? (
          <Button disabled={busy || code.length !== 6} onClick={() => void send("PUT", { code })}>确认开启</Button>
        ) : (
          <Button disabled={busy || !password} onClick={() => void send("POST", { password })}>设置动态验证码</Button>
        )}
      </CardContent>
    </Card>
  );
}
