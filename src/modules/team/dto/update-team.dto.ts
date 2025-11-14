import { PartialType } from '@nestjs/mapped-types';
import { CreateTeamMemberDto } from './create-team.dto';

export class UpdateTeamMemberDto extends PartialType(CreateTeamMemberDto) {}
