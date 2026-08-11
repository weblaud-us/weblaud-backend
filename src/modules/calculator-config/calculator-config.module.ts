import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalculatorConfigController } from './calculator-config.controller';
import { CalculatorConfigService } from './calculator-config.service';
import {
  CalculatorConfig,
  CalculatorConfigSchema,
} from './schemas/calculator-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalculatorConfig.name, schema: CalculatorConfigSchema },
    ]),
  ],
  controllers: [CalculatorConfigController],
  providers: [CalculatorConfigService],
  exports: [CalculatorConfigService],
})
export class CalculatorConfigModule {}
