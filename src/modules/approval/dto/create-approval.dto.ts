import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApprovalSubjectType } from '../schemas/approval.schema';

export class CreateApprovalDto {
  @IsNotEmpty()
  @IsEnum(ApprovalSubjectType)
  subjectType: ApprovalSubjectType;

  @IsOptional()
  @IsMongoId()
  subjectId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
