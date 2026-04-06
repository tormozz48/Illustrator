import { Loader2 } from 'lucide-react';
import type { VariantDetail } from '@/api/client.js';
import { cn } from '@/lib/utils';

interface VariantGalleryProps {
  sceneId: number;
  variants: VariantDetail[];
  selectedVariantId: number | null;
  isGenerating: boolean;
  onSelect: (sceneId: number, variantId: number | null) => void;
}

export function VariantGallery({
  sceneId,
  variants,
  selectedVariantId,
  isGenerating,
  onSelect,
}: VariantGalleryProps) {
  if (variants.length === 0 && !isGenerating) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {variants.map((variant) => {
        const isSelected = selectedVariantId === variant.id;
        return (
          <button
            key={variant.id}
            type="button"
            className={cn(
              'group relative overflow-hidden rounded-lg border-2 transition-all',
              isSelected
                ? 'border-primary shadow-md'
                : 'border-transparent hover:border-border'
            )}
            onClick={() => onSelect(sceneId, isSelected ? null : variant.id)}
          >
            <img
              src={variant.image_url}
              alt="Scene variant"
              className="aspect-square w-full object-cover"
            />
            {variant.validation_score != null && (
              <span
                className={cn(
                  'absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white',
                  variant.validation_score >= 0.8
                    ? 'bg-emerald-600'
                    : variant.validation_score >= 0.6
                      ? 'bg-amber-500'
                      : 'bg-rose-600'
                )}
              >
                {variant.validation_score.toFixed(2)}
              </span>
            )}
            {isSelected && (
              <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                ✓
              </span>
            )}
          </button>
        );
      })}

      {isGenerating && (
        <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
