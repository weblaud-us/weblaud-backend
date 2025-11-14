import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AboutInfo, AboutInfoDocument } from './schemas/about-info.schema';
import { UpdateStatsDto } from 'src/modules/about/dto/update-stats.dto';
import { UpdateStoryMissionDto } from 'src/modules/about/dto/update-story-mission.dto';
import { UpdateTrackRecordDto } from 'src/modules/about/dto/update-track-record.dto';

@Injectable()
export class AboutInfoService {
  constructor(
    @InjectModel(AboutInfo.name)
    private readonly model: Model<AboutInfoDocument>,
  ) {}

  private async getOrCreate() {
    let record = await this.model.findOne();
    if (!record) record = await this.model.create({});
    return record;
  }

  async getPublic() {
    const data = await this.model.findOne().lean();
    return data?.isActive ? data : null;
  }

  async getAdmin() {
    return this.model.findOne().lean();
  }

  // 1️⃣ Update story + mission
  async updateStoryMission(dto: UpdateStoryMissionDto) {
    const record = await this.getOrCreate();
    record.story = dto.story ?? record.story;
    record.mission = dto.mission ?? record.mission;
    return record.save();
  }

  // 2️⃣ Update stats
  async updateStats(dto: UpdateStatsDto) {
    const record = await this.getOrCreate();
    record.stats = { ...record.stats, ...dto };
    return record.save();
  }

  // 3️⃣ Update trackRecord
  async updateTrackRecord(dto: UpdateTrackRecordDto) {
    const record = await this.getOrCreate();
    record.trackRecord = dto.trackRecord;
    return record.save();
  }
}
