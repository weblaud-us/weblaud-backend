import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CalculatorConfigDocument = CalculatorConfig & Document;

class RateOption {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  desc: string;

  @Prop({ required: true })
  weeks: number;

  @Prop({ required: true })
  costMultiplier: number;
}

class TimelineSpeed {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  multiplier: number;

  @Prop({ default: '' })
  desc?: string;

  @Prop({ default: 0 })
  weeksOffset?: number;
}

@Schema({ timestamps: true })
export class CalculatorConfig {
  @Prop({ required: true, default: 4500 })
  baseCost: number;

  /** Upper bound of the quoted range: max = min * (1 + rangeSpreadPct). */
  @Prop({ required: true, default: 0.28 })
  rangeSpreadPct: number;

  /** Both ends of the range snap to this increment, e.g. 500 -> $12,500. */
  @Prop({ required: true, default: 500 })
  roundToNearest: number;

  @Prop({ type: [RateOption], default: [] })
  projectTypes: RateOption[];

  @Prop({ type: [RateOption], default: [] })
  features: RateOption[];

  @Prop({ type: [TimelineSpeed], default: [] })
  timelineSpeeds: TimelineSpeed[];
}

export const CalculatorConfigSchema =
  SchemaFactory.createForClass(CalculatorConfig);
