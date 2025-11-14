import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ContactInfo,
  ContactInfoDocument,
} from './schemas/contact-info.schema';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';

@Injectable()
export class ContactInfoService {
  constructor(
    @InjectModel(ContactInfo.name)
    private readonly model: Model<ContactInfoDocument>,
  ) {}

  // Fetch public info
  async getInfo() {
    const info = await this.model.findOne().lean();
    return info;
  }

  // Admin update (create if not exists)
  async updateInfo(dto: UpdateContactInfoDto) {
    const existing = await this.model.findOne();

    if (!existing) {
      return this.model.create(dto);
    }

    existing.email = dto.email;
    existing.phone = dto.phone;
    existing.addressLine1 = dto.addressLine1;
    existing.addressLine2 = dto.addressLine2;
    existing.city = dto.city;

    return existing.save();
  }
}
