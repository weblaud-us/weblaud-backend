import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectUpdateDto } from './create-project-update.dto';

/** Author editing their own not-yet-published update — see ProjectUpdateService.editOwn(). */
export class EditProjectUpdateDto extends PartialType(CreateProjectUpdateDto) {}
