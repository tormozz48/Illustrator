import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import styles from './Home.module.css';
export default function Home() {
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    async function handleSubmit(e) {
        e.preventDefault();
        const file = fileRef.current?.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setError(null);
        try {
            const book = await api.uploadBook(file, title || undefined, author || undefined);
            navigate(`/books/${book.id}`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            setUploading(false);
        }
    }
    return (_jsxs("main", { className: styles.main, children: [_jsxs("header", { className: styles.hero, children: [_jsx("h1", { children: "\uD83D\uDCD6 Bookillust" }), _jsx("p", { children: "Upload a plain-text book and get a beautifully illustrated reading experience powered by AI." })] }), _jsxs("form", { className: styles.form, onSubmit: handleSubmit, children: [_jsxs("div", { className: styles.field, children: [_jsx("label", { htmlFor: "file", children: "Book file (.txt)" }), _jsx("input", { id: "file", ref: fileRef, type: "file", accept: ".txt", required: true, disabled: uploading })] }), _jsxs("div", { className: styles.field, children: [_jsxs("label", { htmlFor: "title", children: ["Title ", _jsx("span", { className: styles.optional, children: "(optional \u2014 auto-detected from filename)" })] }), _jsx("input", { id: "title", type: "text", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "e.g. Moby Dick", disabled: uploading })] }), _jsxs("div", { className: styles.field, children: [_jsxs("label", { htmlFor: "author", children: ["Author ", _jsx("span", { className: styles.optional, children: "(optional)" })] }), _jsx("input", { id: "author", type: "text", value: author, onChange: (e) => setAuthor(e.target.value), placeholder: "e.g. Herman Melville", disabled: uploading })] }), error && _jsx("p", { className: styles.error, children: error }), _jsx("button", { type: "submit", disabled: uploading, className: styles.btn, children: uploading ? 'Uploading…' : 'Illustrate my book' })] }), _jsx("div", { className: styles.libraryLink, children: _jsx("a", { href: "/books", children: "\u2190 View your library" }) })] }));
}
