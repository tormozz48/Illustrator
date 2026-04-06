import { CheckCircle2, Circle, PencilLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ChapterGridItem } from '@/api/client.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { cn } from '@/lib/utils';

interface ChapterCardProps {
  chapter: ChapterGridItem;
  bookId: string;
}

/** Strip markdown headings and collapse whitespace */
function cleanPreview(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATUS_CONFIG = {
  illustrated: {
    label: 'Illustrated',
    variant: 'success' as const,
    icon: CheckCircle2,
  },
  editing: {
    label: 'Editing',
    variant: 'warning' as const,
    icon: PencilLine,
  },
  draft: {
    label: 'Draft',
    variant: 'outline' as const,
    icon: Circle,
  },
};

export function ChapterCard({ chapter, bookId }: ChapterCardProps) {
  const navigate = useNavigate();
  const config = STATUS_CONFIG[chapter.status];
  const Icon = config.icon;

  return (
    <Card
      className={cn(
        'cursor-pointer gap-2 py-4 transition-all hover:shadow-md hover:-translate-y-0.5',
        chapter.status === 'illustrated' && 'border-emerald-200 bg-emerald-50/30'
      )}
      onClick={() => navigate(`/books/${bookId}/chapters/${chapter.number}`)}
    >
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-muted-foreground">Ch. {chapter.number}</span>
          <Badge variant={config.variant} className="gap-1">
            <Icon className="size-3" />
            {config.label}
          </Badge>
        </div>
        <CardTitle className="mt-1 line-clamp-2 text-sm leading-snug">
          {chapter.title || `Chapter ${chapter.number}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0">
        <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
          {cleanPreview(chapter.content_preview)}
        </p>
        {chapter.scene_count > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {chapter.scene_count} scene{chapter.scene_count !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
