import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * BookDetail — shows processing progress and chapter grid for ready books.
 * During pipeline: poll every 3s, show stepper + sidebar dashboard
 * When ready: fetch chapter grid, poll progress every 5s, show 3-col grid
 * When done: redirect to reader
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, } from '../api/client.js';
import styles from './BookDetail.module.css';
const PIPELINE_STEPS = [
    { key: 'analyzing', label: 'Analyzing characters & world' },
    { key: 'splitting', label: 'Splitting into chapters' },
    { key: 'anchoring', label: 'Building anchor images' },
    { key: 'preparing_scenes', label: 'Preparing scenes' },
    { key: 'ready', label: 'Ready for illustration' },
];
function stepIndex(status) {
    return PIPELINE_STEPS.findIndex((s) => s.key === status);
}
function renderStepper(book) {
    const currentStep = stepIndex(book.status);
    return (_jsx("ol", { className: styles.steps, children: PIPELINE_STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (_jsxs("li", { className: `${styles.step} ${done ? styles.done : ''} ${active ? styles.active : ''}`, children: [_jsx("span", { className: styles.stepDot, children: done ? '✓' : active ? '◉' : '○' }), _jsx("span", { children: step.label }), active && _jsx("span", { className: styles.spinner, "aria-hidden": "true" })] }, step.key));
        }) }));
}
function statusBadgeClass(status) {
    if (status === 'illustrated')
        return styles.badgeIllustrated;
    if (status === 'editing')
        return styles.badgeEditing;
    return styles.badgeDraft;
}
export default function BookDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [book, setBook] = useState(null);
    const [chapters, setChapters] = useState(null);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const [isPublishing, setIsPublishing] = useState(false);
    // Initial load and pipeline polling
    useEffect(() => {
        if (!id)
            return;
        const poll = async () => {
            try {
                const data = await api.getBook(id);
                setBook(data);
                if (data.status === 'done') {
                    navigate(`/books/${id}/read`, { replace: true });
                }
                else if (data.status === 'ready') {
                    // Fetch chapter grid when transitioning to ready
                    const chapterData = await api.listChaptersGrid(id);
                    setChapters(chapterData);
                }
            }
            catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load');
            }
        };
        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, [id, navigate]);
    // Progress polling (every 5s once ready)
    useEffect(() => {
        if (!id || !book || book.status !== 'ready')
            return;
        const pollProgress = async () => {
            try {
                const data = await api.getBookProgress(id);
                setProgress(data);
            }
            catch (err) {
                // Silent fail for progress polling
            }
        };
        pollProgress();
        const interval = setInterval(pollProgress, 5000);
        return () => clearInterval(interval);
    }, [id, book?.status]);
    // Refetch grid on window focus
    useEffect(() => {
        if (!id || book?.status !== 'ready')
            return;
        const handleFocus = async () => {
            try {
                const data = await api.listChaptersGrid(id);
                setChapters(data);
            }
            catch (err) {
                // Silent fail on focus refetch
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [id, book?.status]);
    const handlePublish = async () => {
        if (!id)
            return;
        setIsPublishing(true);
        try {
            await api.publishBook(id);
            // Status will transition to 'publishing' then 'done' via polling
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Publish failed');
            setIsPublishing(false);
        }
    };
    if (error) {
        return (_jsxs("main", { className: styles.main, children: [_jsx("p", { className: styles.error, children: error }), _jsx(Link, { to: "/books", children: "\u2190 Back to library" })] }));
    }
    if (!book) {
        return (_jsx("main", { className: styles.main, children: _jsx("p", { className: styles.muted, children: "Loading\u2026" }) }));
    }
    return (_jsx("main", { className: styles.main, children: _jsxs("div", { className: styles.layout, children: [_jsxs("div", { className: styles.content, children: [_jsx(Link, { to: "/books", className: styles.back, children: "\u2190 Library" }), _jsx("h1", { className: styles.title, children: book.title }), book.author && _jsxs("p", { className: styles.author, children: ["by ", book.author] }), book.status === 'error' ? (_jsxs("div", { className: styles.errorBox, children: [_jsx("strong", { children: "Processing failed" }), book.error_msg && _jsx("p", { children: book.error_msg })] })) : book.status === 'ready' || book.status === 'publishing' ? (_jsxs(_Fragment, { children: [progress &&
                                    progress.total_chapters > 0 &&
                                    progress.illustrated_chapters === progress.total_chapters && (_jsx("button", { className: styles.publishBtn, onClick: handlePublish, disabled: isPublishing, children: isPublishing ? 'Publishing…' : '📖 Publish Book' })), _jsx("div", { className: styles.grid, children: chapters?.map((ch) => (_jsxs("div", { className: styles.card, onClick: () => navigate(`/books/${id}/chapters/${ch.number}`), children: [_jsxs("div", { className: styles.cardHeader, children: [_jsxs("span", { className: styles.chapterNum, children: ["Ch. ", ch.number] }), _jsx("span", { className: `${styles.statusBadge} ${statusBadgeClass(ch.status)}`, children: ch.status === 'illustrated'
                                                            ? '✓ Illustrated'
                                                            : ch.status === 'editing'
                                                                ? 'Editing'
                                                                : 'Draft' })] }), _jsx("h3", { className: styles.cardTitle, children: ch.title || `Chapter ${ch.number}` }), _jsx("p", { className: styles.cardPreview, children: ch.content_preview })] }, ch.id))) })] })) : (renderStepper(book))] }), _jsxs("aside", { className: styles.sidebar, children: [_jsxs("div", { className: styles.sidebarSection, children: [_jsx("h3", { children: "Pipeline" }), renderStepper(book)] }), progress && progress.total_chapters > 0 && (_jsxs("div", { className: styles.sidebarSection, children: [_jsx("h3", { children: "Chapters" }), _jsx("div", { className: styles.progressBar, children: _jsx("div", { className: styles.progressFill, style: {
                                            width: `${(progress.illustrated_chapters / progress.total_chapters) * 100}%`,
                                        } }) }), _jsxs("p", { className: styles.progressText, children: [progress.illustrated_chapters, " / ", progress.total_chapters, " illustrated"] }), _jsxs("div", { className: styles.chapterCounts, children: [_jsxs("span", { children: ["Draft: ", progress.draft_chapters] }), _jsxs("span", { children: ["Editing: ", progress.editing_chapters] }), _jsxs("span", { children: ["\u2713 ", progress.illustrated_chapters] })] })] }))] })] }) }));
}
