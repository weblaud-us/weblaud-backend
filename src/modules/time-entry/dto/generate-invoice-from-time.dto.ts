import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
} from 'class-validator';

export class GenerateInvoiceFromTimeDto {
  @IsNotEmpty()
  @IsMongoId()
  projectId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  entryIds: string[];

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;
}
