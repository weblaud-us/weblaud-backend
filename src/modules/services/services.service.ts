import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Service, ServiceDocument } from './schemas/service.schema';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
  ) {}

async create(dto: CreateServiceDto & { image?: string }) {
  const service = new this.serviceModel(dto);
  return service.save();
}

  async findAll() {
    return this.serviceModel.find().sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const service = await this.serviceModel.findById(id);
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

async update(id: string, dto: UpdateServiceDto & { image?: string }) {
  const service = await this.serviceModel.findByIdAndUpdate(id, dto, {
    new: true,
  });
  if (!service) throw new NotFoundException('Service not found');
  return service;
}
  async remove(id: string) {
    const service = await this.serviceModel.findByIdAndDelete(id);
    if (!service) throw new NotFoundException('Service not found');
    return { message: 'Service deleted' };
  }
}
