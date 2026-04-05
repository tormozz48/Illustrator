/**
 * ChapterPage — edit chapter with scene selection, image generation, and variant picking.
 * Left: full chapter text with inline illustrations
 * Right: scene list with checkboxes, variant gallery, and generation/save controls
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { type ChapterDetail, api } from '../api/client.js';
import styles from './ChapterPage.module.css';

export default function ChapterPage() {
  const { id, num } = useParams<{ id: string; num: string }>();
  const navigate = useNavigate();
  const chapterNum = Number.parseInt(num ?? '', 10);

  // State
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Scene selection state: which scenes are checked for generation
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(new Set());
  // Which variant is selected per scene: Map<sceneId, variantId | null>
  const [selectedVariants, setSelectedVariants] = useState<Map<number, number | null>>(
    new Map()
  );
  // Variant count to generate
  const [variantCount, setVariantCount] = useState(2);
  // Per-scene generation loading
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // On mount: load chapter, if illustrated set to editing
  useEffect(() => {
    if (!id || Number.isNaN(chapterNum)) return;
    loadChapter();
  }, [id, chapterNum]);

  async function loadChapter() {
    setLoading(true);
    try {
      const data = await api.getChapter(id!, chapterNum);
      setChapter(data);
      // Initialize variant selections from existing data
      const variantMap = new Map<number, number | null>();
      for (const scene of data.scenes) {
        const selectedVariant = scene.variants.find((v) => v.selected);
        variantMap.set(scene.id, selectedVariant?.id ?? null);
      }
      setSelectedVariants(variantMap);

      // If chapter is illustrated, set to editing
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
      const result = await api.generateImages(id, chapterNum, {
        scene_ids: sceneIds,
        variant_count: variantCount,
      });
      // Merge new variants into chapter state
      setChapter((prev) => {
        if (!prev) return prev;
        const updatedScenes = prev.scenes.map((scene) => {
          const sceneResult = result.results.find((r) => r.scene_id === scene.id);
          if (!sceneResult) return scene;
          return { ...scene, variants: [...scene.variants, ...sceneResult.variants] };
        });
        return { ...prev, scenes: updatedScenes };
      });
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
      // Build selections for all scenes the user interacted with.
      // variant_id may be null — meaning the user explicitly chose not to illustrate that scene.
      // The backend accepts null and saves it as "scene selected, no image".
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

  // Render inline illustrations in the chapter text
  function renderChapterText() {
    if (!chapter) return null;
    const paragraphs = chapter.content
      .split('\n\n')
      .map((p) => p.trim())
      .filter(Boolean);

    // Build map: insert_after_para → selected variant image URLs
    const illustrationsAt = new Map<number, string[]>();
    for (const scene of chapter.scenes) {
      const selVariantId = selectedVariants.get(scene.id);
      if (selVariantId != null) {
        const variant = scene.variants.find((v) => v.id === selVariantId);
        if (variant) {
          const urls = illustrationsAt.get(scene.insert_after_para) ?? [];
          urls.push(variant.image_url);
          illustrationsAt.set(scene.insert_after_para, urls);
        }
      }
    }

    const elements: React.ReactNode[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      elements.push(
        <p key={`p-${i}`} className={styles.paragraph}>
          {paragraphs[i]}
        </p>
      );
      const imgs = illustrationsAt.get(i);
      if (imgs) {
        for (const url of imgs) {
          elements.push(
            <figure key={`fig-${i}-${url}`} className={styles.inlineIllustration}>
              <img src={url} alt="Scene illustration" />
            </figure>
          );
        }
      }
    }
    return elements;
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <p className={styles.muted}>Loading chapter…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>{error}</p>
        {id && (
          <Link to={`/books/${id}`} className={styles.backLink}>
            ← Back to book
          </Link>
        )}
      </main>
    );
  }

  if (!chapter) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>Chapter not found</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.topBar}>
        <Link to={`/books/${id}`} className={styles.back}>
          ← Back to book
        </Link>
        <div className={styles.chapterMeta}>
          <span className={styles.chapterNum}>Chapter {chapter.number}</span>
          <h1 className={styles.title}>{chapter.title}</h1>
        </div>
        <span className={`${styles.statusBadge} ${styles[chapter.status]}`}>
          {chapter.status}
        </span>
      </div>

      <div className={styles.layout}>
        {/* Left: chapter text */}
        <div className={styles.textPanel}>
          <div className={styles.chapterText}>{renderChapterText()}</div>
        </div>

        {/* Right: scenes panel */}
        <div className={styles.scenesPanel}>
          <h2 className={styles.scenesTitle}>Scenes</h2>

          <div className={styles.sceneList}>
            {chapter.scenes.map((scene) => (
              <div key={scene.id} className={styles.sceneCard}>
                <div className={styles.sceneHeader}>
                  <label className={styles.sceneCheckLabel}>
                    <input
                      type="checkbox"
                      checked={selectedSceneIds.has(scene.id)}
                      onChange={(e) => {
                        setSelectedSceneIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(scene.id);
                          else next.delete(scene.id);
                          return next;
                        });
                      }}
                    />
                    <span className={styles.sceneOrdinal}>Scene {scene.ordinal}</span>
                  </label>
                  <span className={styles.moodTag}>{scene.mood}</span>
                </div>

                <p className={styles.sceneDescription}>{scene.description}</p>
                <p className={styles.visualDescription}>
                  <em>Visual: {scene.visual_description}</em>
                </p>

                {scene.entities.length > 0 && (
                  <div className={styles.entityTags}>
                    {scene.entities.map((e) => (
                      <span key={e} className={styles.entityTag}>
                        {e}
                      </span>
                    ))}
                  </div>
                )}

                {/* Variant gallery */}
                {scene.variants.length > 0 && (
                  <div className={styles.variantGallery}>
                    {scene.variants.map((variant) => {
                      const isSelected = selectedVariants.get(scene.id) === variant.id;
                      return (
                        <div
                          key={variant.id}
                          className={`${styles.variantThumb} ${isSelected ? styles.variantSelected : ''}`}
                          onClick={() => {
                            setSelectedVariants((prev) => {
                              const next = new Map(prev);
                              next.set(scene.id, isSelected ? null : variant.id);
                              return next;
                            });
                          }}
                        >
                          <img src={variant.image_url} alt={`Variant`} />
                          {variant.validation_score != null && (
                            <span
                              className={`${styles.scoreBadge} ${
                                variant.validation_score >= 0.8
                                  ? styles.scoreGood
                                  : variant.validation_score >= 0.6
                                    ? styles.scoreMid
                                    : styles.scoreLow
                              }`}
                            >
                              {variant.validation_score.toFixed(2)}
                            </span>
                          )}
                          {isSelected && <span className={styles.selectedMark}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {scene.variants.length === 0 && generatingScenes.has(scene.id) && (
                  <div className={styles.generatingPlaceholder}>
                    <span>Generating…</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Controls bar */}
          <div className={styles.controlsBar}>
            <div className={styles.variantCountRow}>
              <label htmlFor="variantCount">Variants per scene:</label>
              <select
                id="variantCount"
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actionButtons}>
              <button
                className={styles.generateBtn}
                onClick={handleGenerate}
                disabled={selectedSceneIds.size === 0 || generatingScenes.size > 0}
              >
                {generatingScenes.size > 0 ? 'Generating…' : '✨ Generate'}
              </button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : '💾 Save Chapter'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}