import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from './schemas/contact.schema';
import { CreateContactDto } from './dto/create-contact.dto';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly dashboardNotifier: DashboardNotifierService,
  ) {}

  async submit(dto: CreateContactDto) {
    const saved = await this.contactModel.create(dto);

    // notifyNew never rejects, so a mail outage cannot turn an already-persisted
    // lead into a 500 for the visitor.
    await this.dashboardNotifier.notifyNew({
      kind: 'contact message',
      rows: [
        { label: 'Name', value: `${dto.firstName} ${dto.lastName}`.trim() },
        { label: 'Email', value: dto.email, href: `mailto:${dto.email}` },
        {
          label: 'Phone',
          value: dto.phone,
          href: dto.phone ? `tel:${dto.phone}` : undefined,
        },
        { label: 'Message', value: dto.message },
      ],
      dashboardPath: '/contact-submissions',
      recordId: String(saved._id),
    });

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
