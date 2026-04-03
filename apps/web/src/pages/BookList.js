import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import styles from './BookList.module.css';
const STATUS_LABELS = {
    pending: 'Queued',
    analyzing: 'Analyzing…',
    splitting: 'Splitting chapters…',
    anchoring: 'Finding key scenes…',
    illustrating: 'Generating illustrations…',
    assembling: 'Assembling reader…',
    done: 'Done',
    error: 'Error',
};
function StatusBadge({ status }) {
    return (_jsx("span", { className: `${styles.badge} ${styles[`badge_${status}`]}`, children: STATUS_LABELS[status] ?? status }));
}
export default function BookList() {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = async () => {
        try {
            const data = await api.listBooks();
            setBooks(data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load books');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
        // Poll every 5 s if any book is in-progress
        const interval = setInterval(() => {
            const hasPending = books.some((b) => b.status !== 'done' && b.status !== 'error');
            if (hasPending)
                load();
        }, 5000);
        return () => clearInterval(interval);
    }, [books.length]);
    const handleDelete = async (id) => {
        if (!confirm('Delete this book and all its illustrations?'))
            return;
        await api.deleteBook(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
    };
    return (_jsxs("main", { className: styles.main, children: [_jsxs("header", { className: styles.header, children: [_jsx("h1", { children: "Your Library" }), _jsx(Link, { to: "/", className: styles.uploadBtn, children: "+ Upload book" })] }), loading && _jsx("p", { className: styles.muted, children: "Loading\u2026" }), error && _jsx("p", { className: styles.error, children: error }), !loading && books.length === 0 && (_jsxs("p", { className: styles.empty, children: ["No books yet. ", _jsx(Link, { to: "/", children: "Upload one!" })] })), _jsx("ul", { className: styles.list, children: books.map((book) => (_jsxs("li", { className: styles.card, children: [_jsxs("div", { className: styles.cardMain, children: [_jsx("div", { className: styles.cardTitle, children: book.status === 'done' ? (_jsx(Link, { to: `/books/${book.id}/read`, children: book.title })) : (_jsx("span", { children: book.title })) }), book.author && _jsxs("div", { className: styles.cardAuthor, children: ["by ", book.author] }), _jsxs("div", { className: styles.cardMeta, children: [_jsx(StatusBadge, { status: book.status }), book.error_msg && (_jsxs("span", { className: styles.errorMsg, title: book.error_msg, children: ["\u26A0 ", book.error_msg.slice(0, 80)] }))] })] }), _jsxs("div", { className: styles.cardActions, children: [book.status === 'done' && (_jsx(Link, { to: `/books/${book.id}/read`, className: styles.readBtn, children: "Read" })), (book.status === 'pending' || book.status !== 'done') && book.status !== 'error' && (_jsx(Link, { to: `/books/${book.id}`, className: styles.progressBtn, children: "Progress" })), _jsx("button", { className: styles.deleteBtn, onClick: () => handleDelete(book.id), "aria-label": "Delete book", children: "\uD83D\uDDD1" })] })] }, book.id))) })] }));
}
