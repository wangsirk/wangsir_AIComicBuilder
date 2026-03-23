"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Episode } from "@/stores/episode-store";
import { useState, useRef, useEffect } from "react";

const statusConfig: Record<string, { dot: string; text: string; bg: string }> = {
  draft: { dot: "bg-gray-400", text: "text-gray-600", bg: "bg-gray-50" },
  processing: { dot: "bg-amber-400 animate-pulse", text: "text-amber-700", bg: "bg-amber-50" },
  completed: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
};

interface EpisodeCardProps {
  episode: Episode;
  projectId: string;
  onEdit: (episode: Episode) => void;
  onDelete: (episode: Episode) => void;
}

export function EpisodeCard({ episode, projectId, onEdit, onDelete }: EpisodeCardProps) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const te = useTranslations("episode");
  const tc = useTranslations("common");
  const colors = statusConfig[episode.status] || statusConfig.draft;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const keywordList = episode.keywords
    ? episode.keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean)
    : [];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[--border-subtle] bg-white transition-all duration-200 hover:border-primary/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
      <Link
        href={`/${locale}/project/${projectId}/episodes/${episode.id}/script`}
        className="block p-5"
      >
        {/* Top row: sequence badge + title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 font-display text-sm font-bold text-primary">
              {String(episode.sequence).padStart(2, "0")}
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[--text-primary] group-hover:text-primary transition-colors">
                {episode.title}
              </h3>
            </div>
          </div>
          <span
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${colors.bg} ${colors.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            {t(`projectStatus.${episode.status}` as "projectStatus.draft" | "projectStatus.processing" | "projectStatus.completed")}
          </span>
        </div>

        {/* Description */}
        {episode.description ? (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-[--text-secondary]">
            {episode.description}
          </p>
        ) : (
          <p className="mt-2.5 text-sm text-[--text-muted]/50 italic">
            {te("noDescription")}
          </p>
        )}

        {/* Keywords */}
        {keywordList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Tag className="h-3 w-3 text-[--text-muted]" />
            {keywordList.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="inline-flex rounded-md bg-[--surface] px-2 py-0.5 text-[11px] font-medium text-[--text-secondary]"
              >
                {kw}
              </span>
            ))}
            {keywordList.length > 5 && (
              <span className="text-[11px] text-[--text-muted]">
                +{keywordList.length - 5}
              </span>
            )}
          </div>
        )}
      </Link>

      {/* Actions menu - positioned top-right */}
      <div ref={menuRef} className="absolute right-3 top-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-[--text-muted] opacity-0 transition-all group-hover:opacity-100 hover:bg-[--surface]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-xl border border-[--border-subtle] bg-white py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[--text-secondary] transition-colors hover:bg-[--surface] hover:text-[--text-primary]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onEdit(episode);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {te("edit")}
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(episode);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {tc("delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
