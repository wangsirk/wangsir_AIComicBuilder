"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useModelStore } from "@/stores/model-store";
import { Sparkles, Loader2 } from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";

interface CharacterCardProps {
  id: string;
  projectId: string;
  name: string;
  description: string;
  referenceImage: string | null;
  onUpdate: () => void;
}

export function CharacterCard({
  id,
  projectId,
  name,
  description,
  referenceImage,
  onUpdate,
}: CharacterCardProps) {
  const t = useTranslations();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [editName, setEditName] = useState(name);
  const [editDesc, setEditDesc] = useState(description);
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  async function handleSave() {
    await fetch(`/api/projects/${projectId}/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    onUpdate();
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_character_image",
          payload: { characterId: id },
          modelConfig: getModelConfig(),
        }),
      });
      await response.json();
    } catch (err) {
      console.error("Character image error:", err);
    }
    setGenerating(false);
    onUpdate();
  }

  return (
    <div className="group overflow-hidden rounded-2xl border border-[--border-subtle] bg-white transition-all duration-300 hover:border-[--border-hover] hover:shadow-lg hover:shadow-black/5">
      {/* Avatar area */}
      <div className="relative flex items-center justify-center bg-gradient-to-b from-[--surface] to-white p-8">
        {referenceImage ? (
          <img
            src={uploadUrl(referenceImage)}
            alt={name}
            className="h-36 w-full cursor-pointer rounded-xl object-cover"
            onClick={() => setLightbox(true)}
          />
        ) : generating ? (
          <div className="h-24 w-24 rounded-2xl animate-shimmer" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-3xl font-bold text-primary">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-3 p-4">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          className="h-9 font-display font-semibold text-base"
        />
        <Textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onBlur={handleSave}
          placeholder={t("character.description")}
          className="h-32 resize-none text-sm"
        />
        <div className="space-y-2">
            <InlineModelPicker capability="image" />
            <Button
              onClick={handleGenerateImage}
              disabled={generating}
              className="w-full"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating ? t("common.generating") : t("character.generateImage")}
            </Button>
          </div>
      </div>

      {referenceImage && (
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">{name}</DialogTitle>
            <img
              src={uploadUrl(referenceImage)}
              alt={name}
              className="w-full rounded-xl"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
