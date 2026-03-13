"use client";

import { useState } from "react";
import { useModelStore } from "@/stores/model-store";
import { ProviderCard } from "@/components/settings/provider-card";
import { ProviderForm } from "@/components/settings/provider-form";
import { DefaultModelPicker } from "@/components/settings/default-model-picker";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Settings, Cpu, Zap } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const { providers, addProvider, removeProvider } = useModelStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    providers.length > 0 ? providers[0].id : null
  );

  const selectedProvider = providers.find((p) => p.id === selectedId) || null;

  function handleAdd() {
    const id = addProvider({
      name: "New Provider",
      protocol: "openai",
      capability: "text",
      baseUrl: "https://api.openai.com",
      apiKey: "",
    });
    setSelectedId(id);
  }

  function handleDelete(id: string) {
    removeProvider(id);
    if (selectedId === id) {
      setSelectedId(
        providers.length > 1
          ? providers.find((p) => p.id !== id)?.id || null
          : null
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center justify-between border-b border-[--border-subtle] bg-white/80 backdrop-blur-xl px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[--text-muted] transition-colors hover:bg-[--surface] hover:text-[--text-primary]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-sm font-semibold text-[--text-primary]">
              {t("title")}
            </span>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex-1 bg-[--surface] p-4 lg:p-6">
        <div className="mx-auto max-w-4xl animate-page-in space-y-5">
          {/* Default model selection — top priority */}
          <div className="rounded-2xl border border-[--border-subtle] bg-white p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[--text-muted]">
              <Zap className="h-3.5 w-3.5" />
              {t("defaultModels")}
            </h3>
            <DefaultModelPicker />
          </div>

          {/* Provider section header */}
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[--text-muted]">
              <Cpu className="h-3.5 w-3.5" />
              {t("providers")}
            </h3>
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
              {t("addProvider")}
            </Button>
          </div>

          {/* Provider cards — horizontal tabs */}
          {providers.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  selected={p.id === selectedId}
                  onSelect={() => setSelectedId(p.id)}
                  onDelete={() => handleDelete(p.id)}
                />
              ))}
            </div>
          )}

          {/* Provider form */}
          {providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[--border-subtle] bg-white/50 py-16">
              <Cpu className="h-8 w-8 text-[--text-muted]" />
              <p className="mt-3 text-sm text-[--text-muted]">
                {t("noProviders")}
              </p>
              <Button size="sm" className="mt-4" onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5" />
                {t("addProvider")}
              </Button>
            </div>
          ) : selectedProvider ? (
            <div className="rounded-2xl border border-[--border-subtle] bg-white p-5">
              <ProviderForm key={selectedProvider.id} provider={selectedProvider} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-[--border-subtle] bg-white/50 py-16">
              <p className="text-sm text-[--text-muted]">
                {t("selectProvider")}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
