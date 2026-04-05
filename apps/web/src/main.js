import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import BookDetail from './pages/BookDetail.js';
import BookList from './pages/BookList.js';
import BookReader from './pages/BookReader.js';
import ChapterPage from './pages/ChapterPage.js';
import Home from './pages/Home.js';
const root = document.getElementById('root');
if (!root)
    throw new Error('#root element not found');
createRoot(root).render(_jsx(StrictMode, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Home, {}) }), _jsx(Route, { path: "/books", element: _jsx(BookList, {}) }), _jsx(Route, { path: "/books/:id", element: _jsx(BookDetail, {}) }), _jsx(Route, { path: "/books/:id/chapters/:num", element: _jsx(ChapterPage, {}) }), _jsx(Route, { path: "/books/:id/read", element: _jsx(BookReader, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
