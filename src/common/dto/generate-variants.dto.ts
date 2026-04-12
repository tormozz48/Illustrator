import { IsArray, IsInt, Min, Max } from 'class-validator';

export class GenerateVariantsDto {
  @IsArray()
  scene_ids: number[];

  @IsInt()
  @Min(1)
  @Max(4)
  variant_count: number = 2;
}
