import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ChapterPage — edit chapter with scene selection, image generation, and variant picking.
 * Left: full chapter text with inline illustrations
 * Right: scene list with checkboxes, variant gallery, and generation/save controls
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import styles from './ChapterPage.module.css';
export default function ChapterPage() {
    const { id, num } = useParams();
    const navigate = useNavigate();
    const chapterNum = Number.parseInt(num ?? '', 10);
    // State
    const [chapter, setChapter] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    // Scene selection state: which scenes are checked for generation
    const [selectedSceneIds, setSelectedSceneIds] = useState(new Set());
    // Which variant is selected per scene: Map<sceneId, variantId | null>
    const [selectedVariants, setSelectedVariants] = useState(new Map());
    // Variant count to generate
    const [variantCount, setVariantCount] = useState(2);
    // Per-scene generation loading
    const [generatingScenes, setGeneratingScenes] = useState(new Set());
    const [isSaving, setIsSaving] = useState(false);
    // On mount: load chapter, if illustrated set to editing
    useEffect(() => {
        if (!id || Number.isNaN(chapterNum))
            return;
        loadChapter();
    }, [id, chapterNum]);
    async function loadChapter() {
        setLoading(true);
        try {
            const data = await api.getChapter(id, chapterNum);
            setChapter(data);
            // Initialize variant selections from existing data
            const variantMap = new Map();
            for (const scene of data.scenes) {
                const selectedVariant = scene.variants.find((v) => v.selected);
                variantMap.set(scene.id, selectedVariant?.id ?? null);
            }
            setSelectedVariants(variantMap);
            // If chapter is illustrated, set to editing
            if (data.status === 'illustrated') {
                try {
                    const updated = await api.editChapter(id, chapterNum);
                    setChapter(updated);
                }
                catch {
                    // ignore
                }
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load chapter');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleGenerate() {
        if (!id || !chapter || selectedSceneIds.size === 0)
            return;
        const sceneIds = Array.from(selectedSceneIds);
        setGeneratingScenes(new Set(sceneIds));
        try {
            const result = await api.generateImages(id, chapterNum, {
                scene_ids: sceneIds,
                variant_count: variantCount,
            });
            // Merge new variants into chapter state
            setChapter((prev) => {
                if (!prev)
                    return prev;
                const updatedScenes = prev.scenes.map((scene) => {
                    const sceneResult = result.results.find((r) => r.scene_id === scene.id);
                    if (!sceneResult)
                        return scene;
                    return { ...scene, variants: [...scene.variants, ...sceneResult.variants] };
                });
                return { ...prev, scenes: updatedScenes };
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
        }
        finally {
            setGeneratingScenes(new Set());
        }
    }
    async function handleSave() {
        if (!id || !chapter)
            return;
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
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
            setIsSaving(false);
        }
    }
    // Render inline illustrations in the chapter text
    function renderChapterText() {
        if (!chapter)
            return null;
        const paragraphs = chapter.content
            .split('\n\n')
            .map((p) => p.trim())
            .filter(Boolean);
        // Build map: insert_after_para → selected variant image URLs
        const illustrationsAt = new Map();
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
        const elements = [];
        for (let i = 0; i < paragraphs.length; i++) {
            elements.push(_jsx("p", { className: styles.paragraph, children: paragraphs[i] }, `p-${i}`));
            const imgs = illustrationsAt.get(i);
            if (imgs) {
                for (const url of imgs) {
                    elements.push(_jsx("figure", { className: styles.inlineIllustration, children: _jsx("img", { src: url, alt: "Scene illustration" }) }, `fig-${i}-${url}`));
                }
            }
        }
        return elements;
    }
    if (loading) {
        return (_jsx("main", { className: styles.main, children: _jsx("p", { className: styles.muted, children: "Loading chapter\u2026" }) }));
    }
    if (error) {
        return (_jsxs("main", { className: styles.main, children: [_jsx("p", { className: styles.error, children: error }), id && (_jsx(Link, { to: `/books/${id}`, className: styles.backLink, children: "\u2190 Back to book" }))] }));
    }
    if (!chapter) {
        return (_jsx("main", { className: styles.main, children: _jsx("p", { className: styles.error, children: "Chapter not found" }) }));
    }
    return (_jsxs("main", { className: styles.main, children: [_jsxs("div", { className: styles.topBar, children: [_jsx(Link, { to: `/books/${id}`, className: styles.back, children: "\u2190 Back to book" }), _jsxs("div", { className: styles.chapterMeta, children: [_jsxs("span", { className: styles.chapterNum, children: ["Chapter ", chapter.number] }), _jsx("h1", { className: styles.title, children: chapter.title })] }), _jsx("span", { className: `${styles.statusBadge} ${styles[chapter.status]}`, children: chapter.status })] }), _jsxs("div", { className: styles.layout, children: [_jsx("div", { className: styles.textPanel, children: _jsx("div", { className: styles.chapterText, children: renderChapterText() }) }), _jsxs("div", { className: styles.scenesPanel, children: [_jsx("h2", { className: styles.scenesTitle, children: "Scenes" }), _jsx("div", { className: styles.sceneList, children: chapter.scenes.map((scene) => (_jsxs("div", { className: styles.sceneCard, children: [_jsxs("div", { className: styles.sceneHeader, children: [_jsxs("label", { className: styles.sceneCheckLabel, children: [_jsx("input", { type: "checkbox", checked: selectedSceneIds.has(scene.id), onChange: (e) => {
                                                                setSelectedSceneIds((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (e.target.checked)
                                                                        next.add(scene.id);
                                                                    else
                                                                        next.delete(scene.id);
                                                                    return next;
                                                                });
                                                            } }), _jsxs("span", { className: styles.sceneOrdinal, children: ["Scene ", scene.ordinal] })] }), _jsx("span", { className: styles.moodTag, children: scene.mood })] }), _jsx("p", { className: styles.sceneDescription, children: scene.description }), _jsx("p", { className: styles.visualDescription, children: _jsxs("em", { children: ["Visual: ", scene.visual_description] }) }), scene.entities.length > 0 && (_jsx("div", { className: styles.entityTags, children: scene.entities.map((e) => (_jsx("span", { className: styles.entityTag, children: e }, e))) })), scene.variants.length > 0 && (_jsx("div", { className: styles.variantGallery, children: scene.variants.map((variant) => {
                                                const isSelected = selectedVariants.get(scene.id) === variant.id;
                                                return (_jsxs("div", { className: `${styles.variantThumb} ${isSelected ? styles.variantSelected : ''}`, onClick: () => {
                                                        setSelectedVariants((prev) => {
                                                            const next = new Map(prev);
                                                            next.set(scene.id, isSelected ? null : variant.id);
                                                            return next;
                                                        });
                                                    }, children: [_jsx("img", { src: variant.image_url, alt: `Variant` }), variant.validation_score != null && (_jsx("span", { className: `${styles.scoreBadge} ${variant.validation_score >= 0.8
                                                                ? styles.scoreGood
                                                                : variant.validation_score >= 0.6
                                                                    ? styles.scoreMid
                                                                    : styles.scoreLow}`, children: variant.validation_score.toFixed(2) })), isSelected && _jsx("span", { className: styles.selectedMark, children: "\u2713" })] }, variant.id));
                                            }) })), scene.variants.length === 0 && generatingScenes.has(scene.id) && (_jsx("div", { className: styles.generatingPlaceholder, children: _jsx("span", { children: "Generating\u2026" }) }))] }, scene.id))) }), _jsxs("div", { className: styles.controlsBar, children: [_jsxs("div", { className: styles.variantCountRow, children: [_jsx("label", { htmlFor: "variantCount", children: "Variants per scene:" }), _jsx("select", { id: "variantCount", value: variantCount, onChange: (e) => setVariantCount(Number(e.target.value)), children: [1, 2, 3, 4].map((n) => (_jsx("option", { value: n, children: n }, n))) })] }), _jsxs("div", { className: styles.actionButtons, children: [_jsx("button", { className: styles.generateBtn, onClick: handleGenerate, disabled: selectedSceneIds.size === 0 || generatingScenes.size > 0, children: generatingScenes.size > 0 ? 'Generating…' : '✨ Generate' }), _jsx("button", { className: styles.saveBtn, onClick: handleSave, disabled: isSaving, children: isSaving ? 'Saving…' : '💾 Save Chapter' })] })] })] })] })] }));
}
