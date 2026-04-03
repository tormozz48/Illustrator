import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home.js';
import BookList from './pages/BookList.js';
import BookDetail from './pages/BookDetail.js';
import BookReader from './pages/BookReader.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<BookList />} />
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/books/:id/read" element={<BookReader />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
