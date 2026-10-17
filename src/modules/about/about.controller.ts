import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AboutInfoService } from 'src/modules/about/about.service';
import { UpdateStatsDto } from 'src/modules/about/dto/update-stats.dto';
import { UpdateStoryMissionDto } from 'src/modules/about/dto/update-story-mission.dto';
import { UpdateTrackRecordDto } from 'src/modules/about/dto/update-track-record.dto';

@Controller('about')
export class AboutInfoController {
  constructor(private readonly service: AboutInfoService) {}

  // Public
  @Public()
  @Get()
  getPublic() {
    return this.service.getPublic();
  }

  // Admin
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAdmin() {
    return this.service.getAdmin();
  }

  // 1️⃣ Update Story + Mission
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('story')
  updateStoryMission(@Body() dto: UpdateStoryMissionDto) {
    return this.service.updateStoryMission(dto);
  }

  // 2️⃣ Update Stats
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('stats')
  updateStats(@Body() dto: UpdateStatsDto) {
    return this.service.updateStats(dto);
  }

  // 3️⃣ Update Track Record
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('track-record')
  updateTrackRecord(@Body() dto: UpdateTrackRecordDto) {
    return this.service.updateTrackRecord(dto);
  }
}
