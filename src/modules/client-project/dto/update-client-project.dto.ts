import { PartialType } from '@nestjs/mapped-types';
import { CreateClientProjectDto } from './create-client-project.dto';

export class UpdateClientProjectDto extends PartialType(
  CreateClientProjectDto,
) {}
