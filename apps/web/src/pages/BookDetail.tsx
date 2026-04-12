import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Chip, Grid,
  LinearProgress, CircularProgress, Alert, Paper,
} from '@mui/material';
import { getBook, getBookProgress, listChapters, publishBook, Book, BookProgress, ChapterGridItem } from '../api/client';
import { joinBook, leaveBook, onBookStatus } from '../api/socket';

const statusColors: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  draft: 'default', editing: 'warning', illustrated: 'success',
};

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [chapters, setChapters] = useState<ChapterGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const [b, p, c] = await Promise.all([
          getBook(id),
          getBookProgress(id).catch(() => null),
          listChapters(id).catch(() => []),
        ]);
        setBook(b);
        setProgress(p);
        setChapters(c);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    joinBook(id);
    const unsub = onBookStatus(({ bookId, status }) => {
      if (bookId === id) {
        setBook(prev => prev ? { ...prev, status } : prev);
        // Refetch data when status changes
        fetchData();
      }
    });

    // Poll while processing
    const interval = setInterval(fetchData, 5000);

    return () => {
      leaveBook(id);
      unsub();
      clearInterval(interval);
    };
  }, [id]);

  const handlePublish = async () => {
    if (!id) return;
    setPublishing(true);
    try {
      await publishBook(id);
      setBook(prev => prev ? { ...prev, status: 'done' } : prev);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!book) return <Alert severity="error">Book not found</Alert>;

  const isProcessing = ['pending', 'analyzing', 'splitting', 'anchoring', 'preparing_scenes'].includes(book.status);
  const canPublish = book.status === 'ready' && progress && progress.illustrated === progress.total && progress.total > 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h4">{book.title || 'Untitled'}</Typography>
        <Chip label={book.status} color={isProcessing ? 'primary' : book.status === 'done' ? 'success' : 'warning'} />
      </Box>

      {book.author && <Typography variant="subtitle1" color="text.secondary" gutterBottom>by {book.author}</Typography>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {book.status === 'error' && <Alert severity="error" sx={{ mb: 2 }}>{book.errorMsg}</Alert>}

      {isProcessing && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Processing...</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current step: {book.status.replace('_', ' ')}
          </Typography>
          <LinearProgress />
        </Paper>
      )}

      {progress && progress.total > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Progress</Typography>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Typography>Total: {progress.total}</Typography>
            <Typography>Draft: {progress.draft}</Typography>
            <Typography>Editing: {progress.editing}</Typography>
            <Typography color="success.main">Illustrated: {progress.illustrated}</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(progress.illustrated / progress.total) * 100}
            sx={{ mt: 2 }}
          />
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        {canPublish && (
          <Button variant="contained" onClick={handlePublish} disabled={publishing}>
            {publishing ? 'Publishing...' : 'Publish Book'}
          </Button>
        )}
        {book.status === 'done' && (
          <Button variant="contained" color="secondary" component={RouterLink} to={`/books/${id}/read`}>
            Read Book
          </Button>
        )}
      </Box>

      {chapters.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom>Chapters</Typography>
          <Grid container spacing={2}>
            {chapters.map(ch => (
              <Grid item xs={12} sm={6} md={4} key={ch.id}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Chapter {ch.number}
                    </Typography>
                    {ch.title && <Typography variant="body2" color="text.secondary">{ch.title}</Typography>}
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Chip label={ch.status} size="small" color={statusColors[ch.status] || 'default'} />
                      <Chip label={`${ch.sceneCount} scenes`} size="small" variant="outlined" />
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button component={RouterLink} to={`/books/${id}/chapters/${ch.number}`} size="small">
                      Open
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
