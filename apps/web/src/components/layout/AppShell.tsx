import { BookOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
            <BookOpen className="size-5" />
            <span>Bookillust</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/books"
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors hover:bg-accent',
                pathname.startsWith('/books')
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              Library
            </Link>
            <Link
              to="/"
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors hover:bg-accent',
                pathname === '/'
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              Upload
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
