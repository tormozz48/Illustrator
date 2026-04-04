import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * BookDetail — shows live processing progress for a book that is not yet done.
 * Polls every 3 seconds and redirects to the reader once status === 'done'.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import styles from './BookDetail.module.css';
const STEPS = [
    { key: 'analyzing', label: 'Analyzing characters & world' },
    { key: 'splitting', label: 'Splitting into chapters' },
    { key: 'anchoring', label: 'Finding key scenes' },
    { key: 'illustrating', label: 'Generating illustrations' },
    { key: 'assembling', label: 'Assembling reader' },
    { key: 'done', label: 'Done!' },
];
function stepIndex(status) {
    return STEPS.findIndex((s) => s.key === status);
}
export default function BookDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [book, setBook] = useState(null);
    const [error, setError] = useState(null);
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
            }
            catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load');
            }
        };
        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, [id, navigate]);
    if (error) {
        return (_jsxs("main", { className: styles.main, children: [_jsx("p", { className: styles.error, children: error }), _jsx(Link, { to: "/books", children: "\u2190 Back to library" })] }));
    }
    if (!book) {
        return (_jsx("main", { className: styles.main, children: _jsx("p", { className: styles.muted, children: "Loading\u2026" }) }));
    }
    const currentStep = stepIndex(book.status);
    return (_jsxs("main", { className: styles.main, children: [_jsx(Link, { to: "/books", className: styles.back, children: "\u2190 Library" }), _jsx("h1", { className: styles.title, children: book.title }), book.author && _jsxs("p", { className: styles.author, children: ["by ", book.author] }), book.status === 'error' ? (_jsxs("div", { className: styles.errorBox, children: [_jsx("strong", { children: "Processing failed" }), book.error_msg && _jsx("p", { children: book.error_msg })] })) : (_jsx("ol", { className: styles.steps, children: STEPS.map((step, i) => {
                    const done = i < currentStep;
                    const active = i === currentStep;
                    return (_jsxs("li", { className: `${styles.step} ${done ? styles.done : ''} ${active ? styles.active : ''}`, children: [_jsx("span", { className: styles.stepDot, children: done ? '✓' : active ? '◉' : '○' }), _jsx("span", { children: step.label }), active && _jsx("span", { className: styles.spinner, "aria-hidden": "true" })] }, step.key));
                }) }))] }));
}
