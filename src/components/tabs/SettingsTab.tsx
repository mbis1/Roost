"use client";

import { useState } from "react";
import { useUserSettings } from "@/lib/hooks";
import {
  Card,
  SectionTitle,
  Input,
  Select,
  FormField,
  Grid2,
  Button,
} from "@/components/ui";

type TestState = {
  status: "idle" | "running" | "ok" | "error";
  message?: string;
};

const idle: TestState = { status: "idle" };

export function SettingsTab() {
  const { settings, updateSettings } = useUserSettings();
  const [botTest, setBotTest] = useState<TestState>(idle);
  const [sendTest, setSendTest] = useState<TestState>(idle);
  const [hookTest, setHookTest] = useState<TestState>(idle);
  const [aiTest, setAiTest] = useState<TestState>(idle);
  const [aiSample, setAiSample] = useState<string | null>(null);

  if (!settings)
    return (
      <p className="text-txt-secondary text-sm">Loading settings...</p>
    );

  const u = (k: string, v: unknown) =>
    updateSettings({ [k]: v } as never);

  /* ----- Telegram tests ----- */

  async function runBotTest() {
    setBotTest({ status: "running" });
    try {
      const r = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: settings?.telegram_bot_token || "" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setBotTest({ status: "error", message: j.error || "Failed" });
      } else {
        setBotTest({
          status: "ok",
          message: `Connected: @${j.bot.username} (${j.bot.first_name})`,
        });
      }
    } catch (e) {
      setBotTest({ status: "error", message: String(e) });
    }
  }

  async function runSendTest() {
    setSendTest({ status: "running" });
    try {
      const r = await fetch("/api/telegram/test-send", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setSendTest({ status: "error", message: j.error || "Failed" });
      } else {
        setSendTest({ status: "ok", message: "Sent — check your Telegram." });
      }
    } catch (e) {
      setSendTest({ status: "error", message: String(e) });
    }
  }

  async function runSetWebhook() {
    setHookTest({ status: "running" });
    try {
      const r = await fetch("/api/telegram/set-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: settings?.telegram_bot_token || "" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setHookTest({ status: "error", message: j.error || "Failed" });
      } else {
        setHookTest({
          status: "ok",
          message: `Webhook set: ${j.webhook_url}`,
        });
      }
    } catch (e) {
      setHookTest({ status: "error", message: String(e) });
    }
  }

  /* ----- AI test ----- */

  async function runAiTest() {
    setAiTest({ status: "running" });
    setAiSample(null);
    try {
      const r = await fetch("/api/ai/test-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings?.ai_provider || "",
          api_key: settings?.ai_api_key || "",
          tone: settings?.ai_tone || "",
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setAiTest({ status: "error", message: j.error || "Failed" });
      } else {
        setAiSample(j.polished);
        setAiTest({
          status: "ok",
          message: j.polished_unchanged
            ? "Draft returned unchanged — provider may have failed silently."
            : `Draft generated (${j.provider}, ${j.tone}).`,
        });
      }
    } catch (e) {
      setAiTest({ status: "error", message: String(e) });
    }
  }

  return (
    <div className="max-w-xl">
      <SectionTitle>Settings</SectionTitle>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">Platform Fees</div>
        <Grid2>
          <FormField label="Airbnb Host Fee %">
            <Input
              type="number"
              value={settings.airbnb_host_fee_pct}
              onChange={(v) => u("airbnb_host_fee_pct", Number(v) || 0)}
            />
          </FormField>
          <FormField label="Airbnb Guest Fee %">
            <Input
              type="number"
              value={settings.airbnb_guest_fee_pct}
              onChange={(v) => u("airbnb_guest_fee_pct", Number(v) || 0)}
            />
          </FormField>
          <FormField label="VRBO Host Fee %">
            <Input
              type="number"
              value={settings.vrbo_host_fee_pct}
              onChange={(v) => u("vrbo_host_fee_pct", Number(v) || 0)}
            />
          </FormField>
          <FormField label="Tax Rate %">
            <Input
              type="number"
              value={settings.tax_rate}
              onChange={(v) => u("tax_rate", Number(v) || 0)}
            />
          </FormField>
        </Grid2>
        <p className="text-[10px] text-txt-tertiary mt-2">
          Airbnb default: 3% host / ~14.2% guest. VRBO: ~5% host.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-sm">Telegram Bot</div>
          <span className="text-[10px] text-txt-tertiary">
            For workflow approve / reject pings on your phone
          </span>
        </div>
        <Grid2>
          <FormField label="Bot Token" span>
            <Input
              value={settings.telegram_bot_token || ""}
              onChange={(v) => u("telegram_bot_token", v)}
              placeholder="123456:ABC-DEF1234..."
            />
          </FormField>
          <FormField label="Chat ID" span>
            <Input
              value={settings.telegram_chat_id || ""}
              onChange={(v) => u("telegram_chat_id", v)}
              placeholder="Send /start to your bot in Telegram, then paste the chat id here"
            />
          </FormField>
        </Grid2>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={runBotTest}>
            {botTest.status === "running" ? "Testing…" : "Test bot token"}
          </Button>
          <Button variant="ghost" size="sm" onClick={runSendTest}>
            {sendTest.status === "running" ? "Sending…" : "Send test message"}
          </Button>
          <Button variant="ghost" size="sm" onClick={runSetWebhook}>
            {hookTest.status === "running" ? "Setting…" : "Set webhook"}
          </Button>
        </div>
        <TestResult state={botTest} label="Bot token" />
        <TestResult state={sendTest} label="Send test" />
        <TestResult state={hookTest} label="Webhook" />
        <p className="text-[10px] text-txt-tertiary mt-3 leading-relaxed">
          <strong>Setup:</strong> 1) Open Telegram, message{" "}
          <code className="bg-surface-soft px-1 rounded">@BotFather</code> with{" "}
          <code className="bg-surface-soft px-1 rounded">/newbot</code>, follow
          prompts, paste the token above.{" "}
          2) Click <em>Set webhook</em> so the bot can receive your taps.{" "}
          3) Open Telegram, message your new bot{" "}
          <code className="bg-surface-soft px-1 rounded">/start</code> — the
          bot replies with your chat ID. Paste it above. 4) Click{" "}
          <em>Send test message</em> to confirm.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">AI Configuration</div>
        <Grid2>
          <FormField label="AI Provider">
            <Select
              value={settings.ai_provider}
              onChange={(v) => u("ai_provider", v)}
              options={["groq", "huggingface", "anthropic"]}
            />
          </FormField>
          <FormField label="Response Tone">
            <Select
              value={settings.ai_tone}
              onChange={(v) => u("ai_tone", v)}
              options={["friendly", "formal", "casual"]}
            />
          </FormField>
          <FormField label="API Key" span>
            <Input
              value={settings.ai_api_key}
              onChange={(v) => u("ai_api_key", v)}
              placeholder="gsk_xxxx (Groq) or hf_xxxx (HuggingFace)"
            />
          </FormField>
        </Grid2>
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={runAiTest}>
            {aiTest.status === "running" ? "Testing…" : "Test AI draft"}
          </Button>
        </div>
        <TestResult state={aiTest} label="AI" />
        {aiSample && (
          <div className="mt-2 p-3 rounded-lg bg-surface-soft border border-surface-muted">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-txt-tertiary mb-1">
              Polished sample
            </p>
            <pre className="text-xs text-txt whitespace-pre-wrap font-mono leading-relaxed">
              {aiSample}
            </pre>
          </div>
        )}
        <p className="text-[10px] text-txt-tertiary mt-3 leading-relaxed">
          <strong>Recommended:</strong> Groq is free, fast (~200ms), and uses
          model <code className="bg-surface-soft px-1 rounded">llama-3.1-8b-instant</code>.
          Sign up at{" "}
          <a
            href="https://console.groq.com"
            target="_blank"
            rel="noreferrer"
            className="text-brand underline"
          >
            console.groq.com
          </a>
          , create an API key (starts with <code className="bg-surface-soft px-1 rounded">gsk_</code>),
          paste above.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">Contact & Payment</div>
        <Grid2>
          <FormField label="Phone">
            <Input
              value={settings.phone}
              onChange={(v) => u("phone", v)}
              placeholder="+1 555-0000"
            />
          </FormField>
          <FormField label="Email">
            <Input
              value={settings.email}
              onChange={(v) => u("email", v)}
            />
          </FormField>
          <FormField label="Card Last 4">
            <Input
              value={settings.card_last4}
              onChange={(v) => u("card_last4", v)}
              placeholder="1234"
            />
          </FormField>
        </Grid2>
      </Card>
    </div>
  );
}

function TestResult({
  state,
  label,
}: {
  state: TestState;
  label: string;
}) {
  if (state.status === "idle" || state.status === "running") return null;
  const ok = state.status === "ok";
  return (
    <p
      className={
        "text-[11px] mt-1.5 " +
        (ok ? "text-status-green" : "text-status-red")
      }
    >
      <strong>{label}:</strong> {state.message}
    </p>
  );
}
