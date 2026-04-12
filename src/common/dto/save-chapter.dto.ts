import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SceneSelection {
  sceneId: number;
  variantId: number;
}

export class SaveChapterDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneSelection)
  selections: SceneSelection[];
}
