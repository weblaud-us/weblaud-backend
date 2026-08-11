import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CalculatorConfig,
  CalculatorConfigDocument,
} from './schemas/calculator-config.schema';
import { UpdateCalculatorConfigDto } from './dto/update-calculator-config.dto';

@Injectable()
export class CalculatorConfigService {
  constructor(
    @InjectModel(CalculatorConfig.name)
    private readonly model: Model<CalculatorConfigDocument>,
  ) {}

  private async getOrCreate() {
    let record = await this.model.findOne();
    if (!record) record = await this.model.create({});
    return record;
  }

  async getPublic() {
    return this.getOrCreate();
  }

  async update(dto: UpdateCalculatorConfigDto) {
    const record = await this.getOrCreate();

    if (dto.baseCost !== undefined) record.baseCost = dto.baseCost;
    if (dto.rangeSpreadPct !== undefined)
      record.rangeSpreadPct = dto.rangeSpreadPct;
    if (dto.roundToNearest !== undefined)
      record.roundToNearest = dto.roundToNearest;
    if (dto.projectTypes !== undefined) record.projectTypes = dto.projectTypes;
    if (dto.features !== undefined) record.features = dto.features;
    if (dto.timelineSpeeds !== undefined)
      record.timelineSpeeds = dto.timelineSpeeds;

    return record.save();
  }
}
