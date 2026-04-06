import type { Book } from '@/api/client.js';
import { Badge } from '@/components/ui/badge.js';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued',
  analyzing: 'Analyzing…',
  splitting: 'Splitting…',
  anchoring: 'Building anchors…',
  preparing_scenes: 'Preparing scenes…',
  ready: 'Ready',
  publishing: 'Publishing…',
  illustrating: 'Illustrating…',
  assembling: 'Assembling…',
  done: 'Published',
  error: 'Error',
};

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

const STATUS_VARIANTS: Record<string, Variant> = {
  done: 'success',
  ready: 'secondary',
  error: 'destructive',
  pending: 'outline',
};

export function BookStatusBadge({ status }: { status: Book['status'] }) {
  const variant: Variant = STATUS_VARIANTS[status] ?? 'secondary';
  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}
