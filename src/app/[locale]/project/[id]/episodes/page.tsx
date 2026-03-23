"use client";

import { useEffect, useState, use } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Layers, Plus, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EpisodeCard } from "@/components/editor/episode-card";
import { EpisodeDialog } from "@/components/editor/episode-dialog";
import { useEpisodeStore, type Episode } from "@/stores/episode-store";
import Link from "next/link";

export default function EpisodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const locale = useLocale();
  const t = useTranslations("episode");
  const tc = useTranslations("common");
  const {
    episodes,
    loading,
    fetchEpisodes,
    createEpisode,
    deleteEpisode,
    updateEpisode,
  } = useEpisodeStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    fetchEpisodes(projectId);
  }, [projectId, fetchEpisodes]);

  async function handleCreate(data: { title: string; description?: string; keywords?: string }) {
    await createEpisode(projectId, data);
    toast.success(t("created"));
  }

  async function handleEdit(data: { title: string; description?: string; keywords?: string }) {
    if (!editingEpisode) return;
    await updateEpisode(projectId, editingEpisode.id, data);
    setEditingEpisode(null);
  }

  async function handleDelete(episode: Episode) {
    if (episodes.length <= 1) {
      toast.error(t("cannotDeleteLast"));
      return;
    }
    if (!confirm(t("deleteConfirm"))) return;
    await deleteEpisode(projectId, episode.id);
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-[--text-muted]">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl flex-1 overflow-y-auto bg-[--surface] p-6 pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
              {t("title")}
            </h2>
            <p className="text-xs text-[--text-muted]">
              {episodes.length} {t("count")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {episodes.length > 0 && (
            <Link
              href={`/${locale}/project/${projectId}/episodes/${episodes[0]?.id}/characters`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[--border-subtle] bg-white px-3.5 py-2 text-sm font-medium text-[--text-secondary] shadow-sm transition-all hover:border-primary/20 hover:text-primary"
            >
              <Users className="h-4 w-4" />
              {t("mainCharacter")}
            </Link>
          )}
          <Button onClick={() => setCreateOpen(true)} className="rounded-xl">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("create")}
          </Button>
        </div>
      </div>

      {/* Episode grid */}
      {episodes.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-dashed border-[--border-subtle] bg-white/50 p-8 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10">
            <Layers className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-[--text-primary]">
            {t("title")}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-[--text-secondary]">
            {t("noEpisodes")}
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-6 rounded-xl">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("create")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              projectId={projectId}
              onEdit={(ep) => setEditingEpisode(ep)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <EpisodeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        mode="create"
      />

      {/* Edit dialog */}
      <EpisodeDialog
        open={!!editingEpisode}
        onOpenChange={(open) => { if (!open) setEditingEpisode(null); }}
        onSubmit={handleEdit}
        defaultValues={editingEpisode ? {
          title: editingEpisode.title,
          description: editingEpisode.description || "",
          keywords: editingEpisode.keywords || "",
        } : undefined}
        mode="edit"
      />
    </div>
  );
}
