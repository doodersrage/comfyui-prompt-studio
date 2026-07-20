"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MonoTextArea, TextInput } from "@/components/ui/Field";
import { ToolSection } from "@/components/ui/ToolPageShell";

export default function StyleTransplantPanel() {
  const [styleSource, setStyleSource] = useState("");
  const [subjectPrompt, setSubjectPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function runTransplant() {
    setLoading(true);
    try {
      const response = await fetch("/api/style-transplant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleSource, subjectPrompt }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Transplant failed.");
      }
      setResult(data.prompt ?? "");
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Transplant failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolSection title="Style transplant">
      <p className="mb-3 text-sm text-zinc-400">
        Apply lighting, camera, and mood language from one prompt onto another subject.
      </p>
      <div className="grid gap-3">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-zinc-500">Style source</span>
          <MonoTextArea value={styleSource} onChange={(event) => setStyleSource(event.target.value)} rows={4} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-zinc-500">Subject prompt</span>
          <MonoTextArea value={subjectPrompt} onChange={(event) => setSubjectPrompt(event.target.value)} rows={4} />
        </label>
        <Button disabled={loading} onClick={() => void runTransplant()}>
          {loading ? "Transplanting…" : "Transplant style"}
        </Button>
        {result ? (
          <TextInput readOnly value={result} />
        ) : null}
      </div>
    </ToolSection>
  );
}
