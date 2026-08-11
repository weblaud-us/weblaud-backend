import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from './schemas/contact.schema';
import { CreateContactDto } from './dto/create-contact.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: CreateContactDto) {
    const saved = await this.contactModel.create(dto);

    // A failed notification must not lose the lead — it is already persisted.
    // Previously this was awaited bare, so a mail outage returned a 500 to the
    // visitor for a submission that had in fact been saved.
    try {
      await this.mailService.sendEmail({
        to: this.config.get<string>('mail.admin')!,
        subject: 'New Contact Message',
        template: 'contact',
        context: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          message: dto.message,
        },
      });
    } catch (err) {
      this.logger.error(
        `Contact message ${saved._id as string} saved but notification email failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return saved;
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.contactModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.contactModel.countDocuments(),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(id: string) {
    const updated = await this.contactModel.findByIdAndUpdate(
      id,
      { status: 'read' },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Message not found');

    return updated;
  }

  async delete(id: string) {
    const deleted = await this.contactModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Message not found');
    return { deleted: true };
  }
}
