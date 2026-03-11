"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";
import { useModelStore } from "@/stores/model-store";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Sparkles, Save, Loader2, FileText } from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";

export function ScriptEditor() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { project, updateScript, fetchProject } = useProjectStore();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  if (!project) return null;

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: project.script }),
    });
    setSaving(false);
  }

  async function handleGenerateScript() {
    if (!project) return;
    setGenerating(true);

    const idea = project.script || "";
    updateScript("");

    try {
      const response = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "script_generate",
          payload: { idea },
          modelConfig: getModelConfig(),
        }),
      });

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          updateScript(fullText);
        }
      }

      await fetchProject(project.id);
      router.push(`/${locale}/project/${project.id}/characters`);
    } catch (err) {
      console.error("Script generate error:", err);
    }

    setGenerating(false);
  }

  return (
    <div className="animate-page-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/8">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
            {t("project.script")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <InlineModelPicker capability="text" />
          <Button
            onClick={handleSave}
            variant="outline"
            size="sm"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t("common.save")}
          </Button>
          <Button
            onClick={handleGenerateScript}
            disabled={generating}
            size="sm"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? t("common.generating") : t("project.generateScript")}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-2xl border border-[--border-subtle] bg-white p-1.5">
        <Textarea
          value={project.script}
          onChange={(e) => updateScript(e.target.value)}
          placeholder={t("project.scriptIdeaPlaceholder")}
          rows={20}
          disabled={generating}
          className={`min-h-[200px] max-h-[65vh] overflow-y-auto rounded-xl border-0 bg-transparent p-5 font-mono text-sm leading-relaxed placeholder:text-[--text-muted] focus-visible:ring-0 ${
            generating ? "opacity-40" : ""
          }`}
        />
      </div>

    </div>
  );
}
