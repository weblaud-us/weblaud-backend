import { BadRequestException, Injectable } from '@nestjs/common';
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

  /**
   * `isActive` defaults to false and nothing can set it: the dashboard's About
   * page only posts story/mission, stats and track-record intents, and no
   * route ever accepted the flag. Gating on it meant everything an admin typed
   * here was saved and then never shown on /aboutus. The section components
   * already render nothing for empty copy (`OurMissionAndStory` returns null
   * without a story or mission, `OurTrack` without any entries), so publishing
   * the record as-is is what the dashboard has always implied.
   */
  async getPublic() {
    const record = await this.model.findOne().lean();
    return record ? toPublicAbout(record) : null;
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
    const unevidenced = dto.trackRecord.find(
      (item) => item.publicationApproved && !item.evidenceNote?.trim(),
    );
    if (unevidenced) {
      throw new BadRequestException(
        `Record the evidence for "${unevidenced.title} ${unevidenced.subtitle}" before approving it`,
      );
    }
    const record = await this.getOrCreate();
    record.trackRecord = dto.trackRecord;
    return record.save();
  }
}

/**
 * The public About payload. Track-record entries need explicit approval, and
 * their internal evidence notes never leave the API. `stats` is dropped
 * entirely: its schema default is all zeros, and nothing approves those
 * numbers, so publishing it would turn missing data into a published zero.
 */
export function toPublicAbout(record: AboutInfo & Record<string, unknown>) {
  const published: Record<string, unknown> = { ...record };
  delete published.stats;
  return {
    ...published,
    trackRecord: (record.trackRecord ?? [])
      .filter((item) => item.publicationApproved === true)
      .map((item) => {
        const entry = { ...item };
        delete entry.evidenceNote;
        return entry;
      }),
  };
}
