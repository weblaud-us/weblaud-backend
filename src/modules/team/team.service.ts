import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeamMember } from './schemas/team-member.schema';
import { UploadService } from '@weblaud/upload-pro';
import { CreateTeamMemberDto } from 'src/modules/team/dto/create-team.dto';
import { UpdateTeamMemberDto } from 'src/modules/team/dto/update-team.dto';

@Injectable()
export class TeamService {
  constructor(
    @InjectModel(TeamMember.name) private teamModel: Model<TeamMember>,
    private readonly uploadService: UploadService,
  ) {}

  private getFileUrl(upload: any): string {
    return upload.url ?? upload.path ?? '';
  }

  // Create member — optionally avatar via controller
  async create(dto: CreateTeamMemberDto) {
    return this.teamModel.create(dto);
  }

  // Create with file (controller will call upload)
  async createWithAvatar(dto: CreateTeamMemberDto, file?: Express.Multer.File) {
    if (file) {
      const uploaded = await this.uploadService.upload(file, {
        folder: 'team-avatars',
      });
      dto.avatar = this.getFileUrl(uploaded);
    }
    return this.create(dto);
  }

  // Update member (partial) — supports replacing avatar
  async update(
    id: string,
    dto: UpdateTeamMemberDto,
    file?: Express.Multer.File,
  ) {
    const member = await this.teamModel.findById(id);
    if (!member) throw new NotFoundException('Team member not found');

    if (file) {
      const uploaded = await this.uploadService.upload(file, {
        folder: 'team-avatars',
      });
      dto.avatar = this.getFileUrl(uploaded);
    }

    Object.assign(member, dto);
    await member.save();
    return member;
  }

  async findPublic() {
    return this.teamModel
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
  }

  async findAdmin() {
    return this.teamModel
      .find()
      .sort({ order: 1, createdAt: -1 })
      .lean();
  }

  async findById(id: string) {
    const m = await this.teamModel.findById(id).lean();
    if (!m) throw new NotFoundException('Team member not found');
    return m;
  }

  async delete(id: string) {
    const deleted = await this.teamModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Team member not found');
    return { deleted: true };
  }
}
