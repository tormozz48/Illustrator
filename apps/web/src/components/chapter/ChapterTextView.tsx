import type { ChapterDetail } from '@/api/client.js';

interface ChapterTextViewProps {
  chapter: ChapterDetail;
  selectedVariants: Map<number, number | null>;
}

export function ChapterTextView({ chapter, selectedVariants }: ChapterTextViewProps) {
  const paragraphs = chapter.content
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);

  // Build map: insert_after_para → selected variant URLs
  const illustrationsAt = new Map<number, string[]>();
  for (const scene of chapter.scenes) {
    const variantId = selectedVariants.get(scene.id);
    if (variantId != null) {
      const variant = scene.variants.find((v) => v.id === variantId);
      if (variant) {
        const existing = illustrationsAt.get(scene.insert_after_para) ?? [];
        existing.push(variant.image_url);
        illustrationsAt.set(scene.insert_after_para, existing);
      }
    }
  }

  return (
    <div className="font-serif text-[17px] leading-[1.8] text-foreground">
      {paragraphs.map((para, i) => (
        <div key={i}>
          <p
            className={
              i === 0
                ? 'first-letter:float-left first-letter:mr-1 first-letter:mt-1 first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.8] first-letter:text-primary'
                : ''
            }
          >
            {para}
          </p>
          {illustrationsAt.get(i)?.map((url, j) => (
            <figure key={j} className="my-6 -mx-2">
              <img
                src={url}
                alt="Scene illustration"
                className="w-full rounded-lg shadow-md"
              />
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}
