import { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Chip, Grid,
  IconButton, CircularProgress, Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { listBooks, deleteBook, Book } from '../api/client';

const statusColors: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  pending: 'default',
  analyzing: 'primary',
  splitting: 'primary',
  anchoring: 'primary',
  preparing_scenes: 'primary',
  ready: 'warning',
  publishing: 'warning',
  done: 'success',
  error: 'error',
};

export default function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBooks = async () => {
    try {
      const data = await listBooks();
      setBooks(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
    const interval = setInterval(fetchBooks, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this book?')) return;
    await deleteBook(id);
    setBooks(books.filter(b => b.id !== id));
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Books</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {books.length === 0 ? (
        <Typography color="text.secondary">No books yet. Upload one to get started!</Typography>
      ) : (
        <Grid container spacing={3}>
          {books.map(book => (
            <Grid item xs={12} sm={6} md={4} key={book.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" noWrap>
                    {book.title || 'Untitled'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {book.author || 'Unknown author'}
                  </Typography>
                  <Chip
                    label={book.status}
                    color={statusColors[book.status] || 'default'}
                    size="small"
                  />
                </CardContent>
                <CardActions>
                  <Button component={RouterLink} to={`/books/${book.id}`} size="small">
                    View
                  </Button>
                  {book.status === 'done' && (
                    <Button component={RouterLink} to={`/books/${book.id}/read`} size="small" color="secondary">
                      Read
                    </Button>
                  )}
                  <Box sx={{ flexGrow: 1 }} />
                  <IconButton size="small" onClick={() => handleDelete(book.id)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
