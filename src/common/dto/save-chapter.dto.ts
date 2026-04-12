import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SceneSelection {
  @IsNumber()
  sceneId: number;

  @IsNumber()
  variantId: number;
}

export class SaveChapterDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneSelection)
  selections: SceneSelection[];
}
