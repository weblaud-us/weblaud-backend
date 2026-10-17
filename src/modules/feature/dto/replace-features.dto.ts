import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FeatureStatus } from '../schemas/feature.schema';

class FeatureInput {
  /** Present on a row that already exists (preserves its id/timestamps across the save); absent on a newly added row. */
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(FeatureStatus)
  status?: FeatureStatus;
}

/** Whole-list replace — see FeatureService.replaceForProject for why this stays one save instead of per-row CRUD endpoints. */
export class ReplaceFeaturesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FeatureInput)
  features: FeatureInput[];
}
