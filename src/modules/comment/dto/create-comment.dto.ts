import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty()
  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  mentions?: string[];

  /** Ignored (forced false) for a client author — see CommentService.create. */
  @IsOptional()
  @IsBoolean()
  internal?: boolean;

  @IsOptional()
  @IsMongoId()
  parent?: string;
}
