import type { SceneDetail } from '@/api/client.js';
import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils';
import { VariantGallery } from './VariantGallery.js';

interface SceneCardProps {
  scene: SceneDetail;
  isChecked: boolean;
  isGenerating: boolean;
  selectedVariantId: number | null;
  onToggleCheck: (sceneId: number, checked: boolean) => void;
  onSelectVariant: (sceneId: number, variantId: number | null) => void;
}

export function SceneCard({
  scene,
  isChecked,
  isGenerating,
  selectedVariantId,
  onToggleCheck,
  onSelectVariant,
}: SceneCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        isChecked ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={isChecked}
            onChange={(e) => onToggleCheck(scene.id, e.target.checked)}
          />
          <span className="text-sm font-semibold">Scene {scene.ordinal}</span>
        </label>
        <Badge variant="outline" className="text-xs">
          {scene.mood}
        </Badge>
      </div>

      {/* Description */}
      <p className="mt-2 text-sm text-foreground leading-relaxed">{scene.description}</p>
      <p className="mt-1 text-xs text-muted-foreground italic leading-relaxed">
        {scene.visual_description}
      </p>

      {/* Entity tags */}
      {scene.entities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scene.entities.map((entity) => (
            <Badge key={entity} variant="secondary" className="text-xs">
              {entity}
            </Badge>
          ))}
        </div>
      )}

      {/* Variant gallery */}
      <VariantGallery
        sceneId={scene.id}
        variants={scene.variants}
        selectedVariantId={selectedVariantId}
        isGenerating={isGenerating}
        onSelect={onSelectVariant}
      />
    </div>
  );
}
