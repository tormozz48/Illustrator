import { type FormEvent, useRef, useState } from 'react';
import { ArrowRight, BookText, Loader2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';

export default function Home() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const book = await api.uploadBook(file, title || undefined, author || undefined);
      navigate(`/books/${book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <BookText className="size-8 text-primary" />
            </div>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Illustrate your book</h1>
          <p className="text-muted-foreground">
            Upload a plain-text book and get a beautifully illustrated reading experience powered by
            AI.
          </p>
        </div>

        {/* Upload form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border bg-card p-6 shadow-sm space-y-5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="file">Book file</Label>
            <div className="relative">
              <Input
                id="file"
                ref={fileRef}
                type="file"
                accept=".txt"
                required
                disabled={uploading}
                className="cursor-pointer"
              />
            </div>
            <p className="text-xs text-muted-foreground">Plain text (.txt), up to 10 MB</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected from filename"
              disabled={uploading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="author">
              Author{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Herman Melville"
              disabled={uploading}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={uploading} className="w-full gap-2">
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Illustrate my book
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
