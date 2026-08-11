import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Career, CareerSchema } from '../career/schemas/career.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Career.name, schema: CareerSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
