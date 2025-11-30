import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { TeamMember, TeamMemberSchema } from './schemas/team-member.schema';
import { UploadModule } from '@weblaud/upload-pro';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeamMember.name, schema: TeamMemberSchema },
    ]),
    UploadModule,
  ],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
