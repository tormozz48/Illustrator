# Frontend Routes & UI Structure

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** `apps/web/src/`  
> **Framework:** Vite + React + TanStack Router + Mantine UI

---

## Overview

The frontend is a React SPA with:
- **TanStack Router** for type-safe routing
- **Mantine UI** for all components
- **Headless Clerk** for authentication UI
- **@trpc/react-query** for data fetching

---

## Route Structure

```
/                     → Redirect to /library (if authed) or /sign-in
├── /sign-in          → Sign in form (Headless Clerk + Mantine)
├── /sign-up          → Sign up form (Headless Clerk + Mantine)
├── /library          → Book grid (protected)
│   └── ?status=      → Filter by status (optional query param)
├── /upload           → Upload new book (protected)
├── /book/:bookId     → Book detail/reader (protected)
│   ├── /             → Overview (cover, progress, TOC)
│   └── /chapter/:num → Chapter reader with illustration
└── /404              → Not found
```

---

## File Structure

```
apps/web/src/
├── routes/
│   ├── __root.tsx           # Root layout (Clerk provider, Mantine provider)
│   ├── _auth.tsx            # Auth layout (protected routes wrapper)
│   ├── index.tsx            # Redirect logic
│   ├── sign-in.tsx          # /sign-in
│   ├── sign-up.tsx          # /sign-up
│   ├── _auth.library.tsx    # /library
│   ├── _auth.upload.tsx     # /upload
│   ├── _auth.book.$bookId.tsx        # /book/:bookId
│   └── _auth.book.$bookId.chapter.$num.tsx  # /book/:bookId/chapter/:num
├── features/
│   ├── auth/
│   │   ├── SignInForm.tsx
│   │   ├── SignUpForm.tsx
│   │   └── AuthGuard.tsx
│   ├── library/
│   │   ├── BookGrid.tsx
│   │   ├── BookCard.tsx
│   │   ├── StatusFilter.tsx
│   │   └── EmptyState.tsx
│   ├── upload/
│   │   ├── UploadForm.tsx
│   │   ├── UploadProgress.tsx
│   │   └── useUpload.ts
│   └── reader/
│       ├── BookOverview.tsx
│       ├── ChapterReader.tsx
│       ├── ChapterNavigation.tsx
│       ├── IllustratedImage.tsx
│       └── TableOfContents.tsx
├── components/
│   ├── Layout.tsx
│   ├── Header.tsx
│   ├── LoadingState.tsx
│   └── ErrorState.tsx
├── hooks/
│   ├── useBookProgress.ts   # SSE progress hook
│   └── useAuthRedirect.ts
├── trpc.ts                  # tRPC client setup
├── env.ts                   # Environment validation
├── router.tsx               # TanStack Router config
└── main.tsx                 # App entry
```

---

## Route Definitions

### Root Layout (`__root.tsx`)

```typescript
// apps/web/src/routes/__root.tsx

import { Outlet, createRootRoute } from '@tanstack/react-router';
import { ClerkProvider } from '@clerk/clerk-react';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient, queryClient } from '../trpc';
import { theme } from '../theme';
import { env } from '../env';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <MantineProvider theme={theme}>
            <Outlet />
          </MantineProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ClerkProvider>
  );
}
```

### Auth Layout (`_auth.tsx`)

Protects all child routes, redirects to `/sign-in` if not authenticated.

```typescript
// apps/web/src/routes/_auth.tsx

import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/LoadingState';

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context }) => {
    // Check auth on the server/during navigation
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/sign-in' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  
  if (!isLoaded) {
    return <LoadingState />;
  }
  
  if (!isSignedIn) {
    return null; // Redirect will happen
  }
  
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
```

### Index Route (`index.tsx`)

```typescript
// apps/web/src/routes/index.tsx

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: '/library' });
    } else {
      throw redirect({ to: '/sign-in' });
    }
  },
});
```

### Sign In (`sign-in.tsx`)

```typescript
// apps/web/src/routes/sign-in.tsx

import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { SignInForm } from '../features/auth/SignInForm';

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: '/library' });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  return (
    <div className="auth-page">
      <SignInForm />
    </div>
  );
}
```

### Library (`_auth.library.tsx`)

```typescript
// apps/web/src/routes/_auth.library.tsx

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BookGrid } from '../features/library/BookGrid';
import { StatusFilter } from '../features/library/StatusFilter';

const searchSchema = z.object({
  status: z.enum(['all', 'processing', 'published', 'failed']).optional(),
});

export const Route = createFileRoute('/_auth/library')({
  validateSearch: searchSchema,
  component: LibraryPage,
});

function LibraryPage() {
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  
  return (
    <div>
      <h1>My Library</h1>
      <StatusFilter 
        value={status ?? 'all'} 
        onChange={(newStatus) => navigate({ search: { status: newStatus } })}
      />
      <BookGrid statusFilter={status} />
    </div>
  );
}
```

### Upload (`_auth.upload.tsx`)

```typescript
// apps/web/src/routes/_auth.upload.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { UploadForm } from '../features/upload/UploadForm';

export const Route = createFileRoute('/_auth/upload')({
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  
  const handleUploadSuccess = (bookId: string) => {
    navigate({ to: '/book/$bookId', params: { bookId } });
  };
  
  return (
    <div>
      <h1>Upload New Book</h1>
      <UploadForm onSuccess={handleUploadSuccess} />
    </div>
  );
}
```

### Book Overview (`_auth.book.$bookId.tsx`)

```typescript
// apps/web/src/routes/_auth.book.$bookId.tsx

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { z } from 'zod';
import { trpc } from '../trpc';
import { BookOverview } from '../features/reader/BookOverview';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const Route = createFileRoute('/_auth/book/$bookId')({
  parseParams: (params) => ({
    bookId: z.string().uuid().parse(params.bookId),
  }),
  component: BookPage,
});

function BookPage() {
  const { bookId } = Route.useParams();
  const { data: book, isLoading, error } = trpc.books.get.useQuery({ id: bookId });
  
  if (isLoading) return <LoadingState />;
  if (error || !book) return <ErrorState message="Book not found" />;
  
  return (
    <div>
      <BookOverview book={book} />
      <Outlet /> {/* For nested chapter route */}
    </div>
  );
}
```

### Chapter Reader (`_auth.book.$bookId.chapter.$num.tsx`)

```typescript
// apps/web/src/routes/_auth.book.$bookId.chapter.$num.tsx

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { trpc } from '../trpc';
import { ChapterReader } from '../features/reader/ChapterReader';
import { ChapterNavigation } from '../features/reader/ChapterNavigation';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const Route = createFileRoute('/_auth/book/$bookId/chapter/$num')({
  parseParams: (params) => ({
    bookId: z.string().uuid().parse(params.bookId),
    num: z.coerce.number().int().positive().parse(params.num),
  }),
  component: ChapterPage,
});

function ChapterPage() {
  const { bookId, num } = Route.useParams();
  
  const { data: chapter, isLoading, error } = trpc.chapters.getByNumber.useQuery({
    bookId,
    chapterNumber: num,
  });
  
  const { data: book } = trpc.books.get.useQuery({ id: bookId });
  
  if (isLoading) return <LoadingState />;
  if (error || !chapter) return <ErrorState message="Chapter not found" />;
  
  return (
    <div>
      <ChapterReader chapter={chapter} />
      <ChapterNavigation
        bookId={bookId}
        currentChapter={num}
        totalChapters={book?.chapters.length ?? 0}
      />
    </div>
  );
}
```

---

## Key Components

### SignInForm (Headless Clerk + Mantine)

```typescript
// apps/web/src/features/auth/SignInForm.tsx

import { useSignIn } from '@clerk/clerk-react';
import { useForm } from '@mantine/form';
import { TextInput, PasswordInput, Button, Stack, Alert } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

export function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length >= 8 ? null : 'Password must be at least 8 characters'),
    },
  });
  
  const handleSubmit = async (values: typeof form.values) => {
    if (!isLoaded || !signIn) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await signIn.create({
        identifier: values.email,
        password: values.password,
      });
      
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate({ to: '/library' });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        
        <TextInput
          label="Email"
          placeholder="your@email.com"
          required
          {...form.getInputProps('email')}
        />
        
        <PasswordInput
          label="Password"
          placeholder="Your password"
          required
          {...form.getInputProps('password')}
        />
        
        <Button type="submit" loading={loading}>
          Sign In
        </Button>
      </Stack>
    </form>
  );
}
```

### BookGrid

```typescript
// apps/web/src/features/library/BookGrid.tsx

import { SimpleGrid, Card, Image, Text, Badge, Group } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { trpc } from '../../trpc';
import { EmptyState } from './EmptyState';
import { BookCard } from './BookCard';

interface Props {
  statusFilter?: string;
}

export function BookGrid({ statusFilter }: Props) {
  const { data: books, isLoading } = trpc.books.list.useQuery();
  
  if (isLoading) return <div>Loading...</div>;
  if (!books || books.length === 0) return <EmptyState />;
  
  const filtered = statusFilter && statusFilter !== 'all'
    ? books.filter(b => b.status === statusFilter)
    : books;
  
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
      {filtered.map(book => (
        <BookCard key={book.id} book={book} />
      ))}
    </SimpleGrid>
  );
}
```

### UploadForm

```typescript
// apps/web/src/features/upload/UploadForm.tsx

import { useState } from 'react';
import { Dropzone } from '@mantine/dropzone';
import { TextInput, Button, Stack, Progress, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useUpload } from './useUpload';

interface Props {
  onSuccess: (bookId: string) => void;
}

export function UploadForm({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const { upload, progress, isUploading, error } = useUpload();
  
  const form = useForm({
    initialValues: {
      title: '',
    },
    validate: {
      title: (value) => (value.length > 0 ? null : 'Title is required'),
    },
  });
  
  const handleSubmit = async (values: typeof form.values) => {
    if (!file) return;
    
    const result = await upload({
      file,
      title: values.title,
    });
    
    if (result?.bookId) {
      onSuccess(result.bookId);
    }
  };
  
  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <TextInput
          label="Book Title"
          placeholder="Enter the title of your book"
          required
          {...form.getInputProps('title')}
        />
        
        <Dropzone
          onDrop={(files) => setFile(files[0])}
          accept={['text/plain']}
          maxSize={10 * 1024 * 1024}
          maxFiles={1}
        >
          <Text ta="center">
            {file ? file.name : 'Drop a .txt file here or click to select'}
          </Text>
        </Dropzone>
        
        {isUploading && (
          <Progress value={progress} animated />
        )}
        
        {error && (
          <Text c="red">{error}</Text>
        )}
        
        <Button 
          type="submit" 
          disabled={!file || isUploading}
          loading={isUploading}
        >
          Upload and Process
        </Button>
      </Stack>
    </form>
  );
}
```

### useBookProgress (SSE Hook)

```typescript
// apps/web/src/hooks/useBookProgress.ts

import { useState, useEffect, useCallback } from 'react';
import { env } from '../env';

interface BookProgress {
  status: string;
  completedChapters: number;
  expectedChapters: number | null;
  currentStep?: string;
  percent?: number;
}

export function useBookProgress(bookId: string) {
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const eventSource = new EventSource(
      `${env.VITE_API_URL}/api/progress/${bookId}`,
      { withCredentials: true }
    );
    
    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };
    
    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      setProgress(prev => ({ ...prev, ...data }));
    });
    
    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      setProgress(prev => prev ? { ...prev, ...data } : data);
    });
    
    eventSource.addEventListener('done', () => {
      eventSource.close();
      setIsConnected(false);
    });
    
    eventSource.addEventListener('heartbeat', () => {
      // Connection alive
    });
    
    eventSource.onerror = () => {
      setError('Connection lost. Reconnecting...');
      setIsConnected(false);
    };
    
    return () => {
      eventSource.close();
    };
  }, [bookId]);
  
  return { progress, isConnected, error };
}
```

### ChapterReader

```typescript
// apps/web/src/features/reader/ChapterReader.tsx

import { Paper, Title, Text, Image, Stack, Divider } from '@mantine/core';
import type { ChapterSelect } from '@shared/db';

interface Props {
  chapter: ChapterSelect;
}

export function ChapterReader({ chapter }: Props) {
  return (
    <Paper p="xl" withBorder>
      <Stack>
        <Title order={2}>
          Chapter {chapter.chapterNumber}: {chapter.title}
        </Title>
        
        {chapter.imageUrl && (
          <Image
            src={chapter.imageUrl}
            alt={`Illustration for ${chapter.title}`}
            radius="md"
            maw={800}
            mx="auto"
          />
        )}
        
        {chapter.sceneDescription && (
          <Text fs="italic" c="dimmed" ta="center">
            {chapter.sceneDescription}
          </Text>
        )}
        
        <Divider my="md" />
        
        <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
          {chapter.content}
        </Text>
      </Stack>
    </Paper>
  );
}
```

---

## Route Summary

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/` | Redirect | ❌ | Redirects to `/library` or `/sign-in` |
| `/sign-in` | SignInForm | ❌ | User sign in |
| `/sign-up` | SignUpForm | ❌ | User registration |
| `/library` | BookGrid | ✅ | Main book list |
| `/library?status=X` | BookGrid | ✅ | Filtered book list |
| `/upload` | UploadForm | ✅ | Upload new book |
| `/book/:bookId` | BookOverview | ✅ | Book details + TOC |
| `/book/:bookId/chapter/:num` | ChapterReader | ✅ | Read chapter with illustration |

---

## Navigation Flow

```
Sign In → Library (book grid)
              ↓
         Click book → Book Overview (cover, progress, TOC)
              ↓
         Click chapter → Chapter Reader (illustration + text)
              ↓ ↑
         Prev/Next navigation between chapters
              
Upload button → Upload Form → Processing → Book Overview
```
