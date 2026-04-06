import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Book } from '@/api/client.js';

const PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyze characters & world' },
  { key: 'splitting', label: 'Split into chapters' },
  { key: 'anchoring', label: 'Build anchor portraits' },
  { key: 'preparing_scenes', label: 'Prepare scenes' },
  { key: 'ready', label: 'Ready for illustration' },
];

function stepIndex(status: string): number {
  return PIPELINE_STEPS.findIndex((s) => s.key === status);
}

interface PipelineStepperProps {
  book: Book;
}

export function PipelineStepper({ book }: PipelineStepperProps) {
  const currentStep = stepIndex(book.status);
  const allDone =
    book.status === 'ready' ||
    book.status === 'publishing' ||
    book.status === 'done' ||
    currentStep === -1;

  return (
    <ol className="space-y-2">
      {PIPELINE_STEPS.map((step, i) => {
        const done = allDone || i < currentStep;
        const active = !allDone && i === currentStep;

        return (
          <li key={step.key} className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-emerald-500 bg-emerald-500 text-white',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-border text-muted-foreground'
              )}
            >
              {done ? (
                <Check className="size-3.5" />
              ) : active ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span
              className={cn(
                'text-sm',
                done && 'text-muted-foreground line-through',
                active && 'font-medium text-foreground',
                !done && !active && 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
