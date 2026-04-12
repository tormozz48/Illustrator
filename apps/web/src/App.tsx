import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import Home from './pages/Home';
import BookList from './pages/BookList';
import BookDetail from './pages/BookDetail';
import ChapterPage from './pages/ChapterPage';
import BookReader from './pages/BookReader';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<BookList />} />
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/books/:id/chapters/:num" element={<ChapterPage />} />
        <Route path="/books/:id/read" element={<BookReader />} />
      </Routes>
    </AppShell>
  );
}
