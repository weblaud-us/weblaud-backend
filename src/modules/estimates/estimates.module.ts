import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EstimatesService } from './estimates.service';
import { EstimatesController } from './estimates.controller';
import { Estimate, EstimateSchema } from './schemas/estimate.schema';
import { MailModule } from '../mail/mail.module';
import { CalculatorConfigModule } from '../calculator-config/calculator-config.module';

@Module({
  imports: [
    MailModule,
    CalculatorConfigModule,
    MongooseModule.forFeature([
      { name: Estimate.name, schema: EstimateSchema },
    ]),
  ],
  controllers: [EstimatesController],
  providers: [EstimatesService],
})
export class EstimatesModule {}
