import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Save, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { type ChapterDetail, api, generateImagesStream } from '@/api/client.js';
import { ChapterTextView } from '@/components/chapter/ChapterTextView.js';
import { SceneCard } from '@/components/chapter/SceneCard.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';

const STATUS_VARIANT: Record<string, 'outline' | 'success' | 'warning'> = {
  draft: 'outline',
  editing: 'warning',
  illustrated: 'success',
};

export default function ChapterPage() {
  const { id, num } = useParams<{ id: string; num: string }>();
  const navigate = useNavigate();
  const chapterNum = Number.parseInt(num ?? '', 10);

  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Map<number, number | null>>(new Map());
  const [variantCount, setVariantCount] = useState(2);
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id || Number.isNaN(chapterNum)) return;
    loadChapter();
  }, [id, chapterNum]);

  async function loadChapter() {
    setLoading(true);
    try {
      const data = await api.getChapter(id!, chapterNum);
      setChapter(data);
      const variantMap = new Map<number, number | null>();
      for (const scene of data.scenes) {
        const sel = scene.variants.find((v) => v.selected);
        variantMap.set(scene.id, sel?.id ?? null);
      }
      setSelectedVariants(variantMap);
      if (data.status === 'illustrated') {
        try {
          const updated = await api.editChapter(id!, chapterNum);
          setChapter(updated);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chapter');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!id || !chapter || selectedSceneIds.size === 0) return;
    const sceneIds = Array.from(selectedSceneIds);
    setGeneratingScenes(new Set(sceneIds));
    try {
      for await (const event of generateImagesStream(id, chapterNum, {
        scene_ids: sceneIds,
        variant_count: variantCount,
      })) {
        if (event.type === 'variant') {
          setChapter((prev) =>
            prev
              ? {
                  ...prev,
                  scenes: prev.scenes.map((s) =>
                    s.id !== event.scene_id
                      ? s
                      : { ...s, variants: [...s.variants, event.variant] }
                  ),
                }
              : prev
          );
        } else if (event.type === 'scene_done') {
          setGeneratingScenes((prev) => {
            const next = new Set(prev);
            next.delete(event.scene_id);
            return next;
          });
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGeneratingScenes(new Set());
    }
  }

  async function handleSave() {
    if (!id || !chapter) return;
    setIsSaving(true);
    try {
      const selections = chapter.scenes.map((scene) => ({
        scene_id: scene.id,
        variant_id: selectedVariants.get(scene.id) ?? null,
      }));
      await api.saveChapter(id, chapterNum, { selections });
      navigate(`/books/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Loading chapter…</span>
        </div>
      </AppShell>
    );
  }

  if (error || !chapter) {
    return (
      <AppShell>
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? 'Chapter not found'}
        </p>
        {id && (
          <Button asChild variant="ghost" size="sm" className="mt-3">
            <Link to={`/books/${id}`}>← Back to book</Link>
          </Button>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Top bar */}
      <div className="mb-6 flex items-center gap-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to={`/books/${id}`}>
            <ChevronLeft className="size-4" />
            Book
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            Chapter {chapter.number}
          </span>
          <h1 className="truncate text-lg font-semibold">{chapter.title}</h1>
        </div>
        <Badge variant={STATUS_VARIANT[chapter.status]}>{chapter.status}</Badge>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 min-h-0">
        {/* Left: chapter text */}
        <div className="flex-1 min-w-0 overflow-y-auto rounded-xl border bg-card p-8 shadow-sm">
          <ChapterTextView chapter={chapter} selectedVariants={selectedVariants} />
        </div>

        {/* Right: scenes panel */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4">
          {/* Controls */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="variantCount" className="text-sm">
                  Variants per scene
                </Label>
                <Select
                  value={String(variantCount)}
                  onValueChange={(v) => setVariantCount(Number(v))}
                >
                  <SelectTrigger id="variantCount" size="sm" className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={selectedSceneIds.size === 0 || generatingScenes.size > 0}
                >
                  {generatingScenes.size > 0 ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Generate
                    </>
                  )}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>

            {selectedSceneIds.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedSceneIds.size} scene{selectedSceneIds.size !== 1 ? 's' : ''} selected for
                generation
              </p>
            )}
          </div>

          {/* Scene list */}
          <div className="flex flex-col gap-3 overflow-y-auto">
            {chapter.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isChecked={selectedSceneIds.has(scene.id)}
                isGenerating={generatingScenes.has(scene.id)}
                selectedVariantId={selectedVariants.get(scene.id) ?? null}
                onToggleCheck={(sceneId, checked) => {
                  setSelectedSceneIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(sceneId);
                    else next.delete(sceneId);
                    return next;
                  });
                }}
                onSelectVariant={(sceneId, variantId) => {
                  setSelectedVariants((prev) => {
                    const next = new Map(prev);
                    next.set(sceneId, variantId);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
