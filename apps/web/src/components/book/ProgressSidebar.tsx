import type { Book, BookProgress } from '@/api/client.js';
import { Progress } from '@/components/ui/progress.js';
import { Separator } from '@/components/ui/separator.js';
import { PipelineStepper } from './PipelineStepper.js';

interface ProgressSidebarProps {
  book: Book;
  progress: BookProgress | null;
}

export function ProgressSidebar({ book, progress }: ProgressSidebarProps) {
  const pct =
    progress && progress.total_chapters > 0
      ? Math.round((progress.illustrated_chapters / progress.total_chapters) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Pipeline
        </h3>
        <PipelineStepper book={book} />
      </div>

      {progress && progress.total_chapters > 0 && (
        <>
          <Separator />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Chapters
              </h3>
              <span className="text-sm font-medium">{pct}%</span>
            </div>
            <Progress value={pct} className="mb-3" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatBox label="Draft" value={progress.draft_chapters} />
              <StatBox label="Editing" value={progress.editing_chapters} />
              <StatBox label="Done" value={progress.illustrated_chapters} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2">
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
