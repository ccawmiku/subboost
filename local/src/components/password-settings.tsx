"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { Input } from "@subboost/ui/components/ui/input";

export function PasswordSettings({ active }: { active: boolean }) {
  const [available, setAvailable] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!active) return;
    void fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json())
      .then((result: { singleAdminLogin?: boolean }) => setAvailable(result.singleAdminLogin === true))
      .catch(() => setAvailable(false));
  }, [active]);

  const submit = async () => {
    if (newPassword !== confirm) { setMessage("两次新密码不一致"); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, code }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "修改失败");
      window.location.href = "/login";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改失败");
    } finally { setBusy(false); }
  };

  if (!active || !available) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">更换密码</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-white/60">修改后所有设备都需要重新登录。开启 TOTP 时请输入当前动态码。</p>
        <PasswordField label="当前密码" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <PasswordField label="新密码" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <PasswordField label="确认新密码" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        <Input aria-label="当前动态码（若已开启）" placeholder="当前动态码（若已开启）" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        {message ? <p role="alert" className="text-sm text-red-300">{message}</p> : null}
        <Button disabled={busy || !currentPassword || newPassword.length < 10 || !confirm} onClick={() => void submit()}>更新密码</Button>
      </CardContent>
    </Card>
  );
}
