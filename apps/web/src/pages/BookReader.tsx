import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Alert, Paper, List, ListItemButton, ListItemText,
  Drawer, IconButton, AppBar, Toolbar,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { getReaderData, ReaderData } from '../api/client';

export default function BookReader() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReaderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    getReaderData(id)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Alert severity="error">No reader data</Alert>;

  const scrollToChapter = (num: number) => {
    document.getElementById(`chapter-${num}`)?.scrollIntoView({ behavior: 'smooth' });
    setDrawerOpen(false);
  };

  return (
    <Box>
      <AppBar position="sticky" color="default" elevation={1} sx={{ mb: 3 }}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6">{data.book.title || 'Untitled'}</Typography>
        </Toolbar>
      </AppBar>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 280, p: 2 }}>
          <Typography variant="h6" gutterBottom>Table of Contents</Typography>
          <List>
            {data.chapters.map(ch => (
              <ListItemButton key={ch.number} onClick={() => scrollToChapter(ch.number)}>
                <ListItemText
                  primary={`Chapter ${ch.number}`}
                  secondary={ch.title}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        {data.book.author && (
          <Typography variant="subtitle1" color="text.secondary" align="center" gutterBottom>
            by {data.book.author}
          </Typography>
        )}

        {data.chapters.map(ch => {
          const paragraphs = ch.content.split('\n');
          const illustrationMap = new Map(
            ch.illustrations.map(ill => [ill.paragraphIndex, ill.imageUrl])
          );

          return (
            <Paper key={ch.number} id={`chapter-${ch.number}`} sx={{ p: 4, mb: 4 }}>
              <Typography variant="h5" gutterBottom sx={{ fontFamily: 'serif' }}>
                Chapter {ch.number}{ch.title ? `: ${ch.title}` : ''}
              </Typography>

              {paragraphs.map((para, i) => (
                <Box key={i}>
                  <Typography
                    variant="body1"
                    paragraph
                    sx={{ fontFamily: 'serif', lineHeight: 1.8, textIndent: '1.5em' }}
                  >
                    {para}
                  </Typography>
                  {illustrationMap.has(i) && (
                    <Box sx={{ my: 3, textAlign: 'center' }}>
                      <img
                        src={illustrationMap.get(i)}
                        alt={`Illustration for paragraph ${i}`}
                        style={{ maxWidth: '100%', borderRadius: 8 }}
                      />
                    </Box>
                  )}
                </Box>
              ))}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
