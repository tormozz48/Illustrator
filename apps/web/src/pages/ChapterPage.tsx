import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Grid, Chip,
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert,
  Checkbox, ImageList, ImageListItem, ImageListItemBar,
  IconButton, Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getChapterDetail, generateVariants, saveChapter, editChapter, ChapterDetail } from '../api/client';
import { joinBook, leaveBook, onVariantGenerated, onGenerationDone, onGenerationError } from '../api/socket';

export default function ChapterPage() {
  const { id: bookId, num } = useParams<{ id: string; num: string }>();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(new Set());
  const [variantCount, setVariantCount] = useState(2);
  const [selections, setSelections] = useState<Record<number, number>>({});

  const fetchChapter = async () => {
    if (!bookId || !num) return;
    try {
      const data = await getChapterDetail(bookId, parseInt(num));
      setChapter(data);
      const sel: Record<number, number> = {};
      data.scenes.forEach(s => {
        const selected = s.variants.find(v => v.selected);
        if (selected) sel[s.id] = selected.id;
      });
      setSelections(sel);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChapter();

    if (bookId) {
      joinBook(bookId);

      const unsub1 = onVariantGenerated(({ chapterNum, sceneId, variant }) => {
        if (chapterNum === parseInt(num || '0')) {
          setChapter(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              scenes: prev.scenes.map(s =>
                s.id === sceneId
                  ? { ...s, variants: [...s.variants, variant] }
                  : s
              ),
            };
          });
        }
      });

      const unsub2 = onGenerationDone(({ chapterNum }) => {
        if (chapterNum === parseInt(num || '0')) {
          setGenerating(false);
        }
      });

      const unsub3 = onGenerationError(({ chapterNum, error }) => {
        if (chapterNum === parseInt(num || '0')) {
          setGenerating(false);
          setError(error);
        }
      });

      return () => {
        leaveBook(bookId);
        unsub1();
        unsub2();
        unsub3();
      };
    }
  }, [bookId, num]);

  const handleGenerate = async () => {
    if (!bookId || !num || selectedScenes.size === 0) return;
    setGenerating(true);
    setError('');
    try {
      await generateVariants(bookId, parseInt(num), Array.from(selectedScenes), variantCount);
    } catch (err: any) {
      setError(err.message);
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!bookId || !num) return;
    const sels = Object.entries(selections).map(([sceneId, variantId]) => ({
      sceneId: parseInt(sceneId),
      variantId,
    }));
    if (sels.length === 0) return;

    setSaving(true);
    try {
      await saveChapter(bookId, parseInt(num), sels);
      await fetchChapter();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!bookId || !num) return;
    try {
      await editChapter(bookId, parseInt(num));
      await fetchChapter();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!chapter) return <Alert severity="error">Chapter not found</Alert>;

  // Enable save when all scenes that have generated variants have a selection made
  const scenesWithVariants = chapter.scenes.filter(s => s.variants.length > 0);
  const allScenesWithVariantsSelected = scenesWithVariants.length > 0 &&
    scenesWithVariants.every(s => selections[s.id]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Chapter {chapter.number}{chapter.title ? `: ${chapter.title}` : ''}
      </Typography>
      <Chip label={chapter.status} size="small" sx={{ mb: 2 }} />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, maxHeight: '70vh', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>Text</Typography>
            {chapter.content.split('\n').map((para, i) => (
              <Typography key={i} variant="body2" paragraph>{para}</Typography>
            ))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          {chapter.status !== 'illustrated' && (
            <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Variants</InputLabel>
                <Select value={variantCount} onChange={e => setVariantCount(Number(e.target.value))} label="Variants">
                  {[1, 2, 3, 4].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                onClick={handleGenerate}
                disabled={generating || selectedScenes.size === 0}
              >
                {generating ? 'Generating...' : `Generate (${selectedScenes.size} scenes)`}
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={handleSave}
                disabled={saving || !allScenesWithVariantsSelected}
              >
                {saving ? 'Saving...' : 'Save Selections'}
              </Button>
            </Paper>
          )}

          {chapter.status === 'illustrated' && (
            <Box sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={handleEdit}>Edit Selections</Button>
            </Box>
          )}

          {chapter.scenes.map(scene => (
            <Card key={scene.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {chapter.status !== 'illustrated' && (
                    <Checkbox
                      checked={selectedScenes.has(scene.id)}
                      onChange={(e) => {
                        const next = new Set(selectedScenes);
                        e.target.checked ? next.add(scene.id) : next.delete(scene.id);
                        setSelectedScenes(next);
                      }}
                    />
                  )}
                  <Typography variant="subtitle1" fontWeight={600}>
                    Scene (paragraph {scene.paragraphIndex})
                  </Typography>
                  <Chip label={scene.mood} size="small" variant="outlined" />
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {scene.description}
                </Typography>

                {scene.variants.length > 0 && (
                  <ImageList cols={Math.min(scene.variants.length, 3)} gap={8} sx={{ mt: 1 }}>
                    {scene.variants.map(v => (
                      <ImageListItem
                        key={v.id}
                        onClick={() => setSelections(prev => ({ ...prev, [scene.id]: v.id }))}
                        sx={{
                          cursor: 'pointer',
                          border: selections[scene.id] === v.id ? '3px solid' : '3px solid transparent',
                          borderColor: selections[scene.id] === v.id ? 'primary.main' : 'transparent',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <img src={v.imageUrl} alt={`Variant ${v.id}`} loading="lazy" />
                        <ImageListItemBar
                          subtitle={v.score ? `Score: ${(v.score * 100).toFixed(0)}%` : ''}
                          actionIcon={
                            selections[scene.id] === v.id ? (
                              <IconButton sx={{ color: 'white' }}>
                                <CheckCircleIcon />
                              </IconButton>
                            ) : undefined
                          }
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                )}
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}
