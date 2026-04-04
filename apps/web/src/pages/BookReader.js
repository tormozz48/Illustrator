import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * BookReader — embeds the assembled HTML in a full-page iframe.
 *
 * The assembled HTML lives at /api/books/:id/read and is served directly
 * by the Worker from R2 (or KV cache). We use an iframe so the reader's
 * own scoped CSS doesn't bleed into the SPA styles.
 */
import { Link, useParams } from 'react-router-dom';
import styles from './BookReader.module.css';
export default function BookReader() {
    const { id } = useParams();
    if (!id)
        return _jsx("p", { children: "Invalid book ID" });
    const src = `/api/books/${id}/read`;
    return (_jsxs("div", { className: styles.container, children: [_jsx("nav", { className: styles.topBar, children: _jsx(Link, { to: "/books", className: styles.back, children: "\u2190 Library" }) }), _jsx("iframe", { className: styles.frame, src: src, title: "Book reader", sandbox: "allow-same-origin allow-scripts allow-popups" })] }));
}
