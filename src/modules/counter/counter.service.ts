import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from './schemas/counter.schema';

@Injectable()
export class CounterService {
  constructor(
    @InjectModel(Counter.name) private readonly model: Model<CounterDocument>,
  ) {}

  /**
   * Atomically returns the next integer in the named sequence, starting at 1.
   * `findOneAndUpdate` with `$inc` is a single atomic operation on Mongo's
   * side, so two callers racing for the same key each get a distinct,
   * monotonically increasing value — unlike `countDocuments() + 1`, which
   * reads and writes as two separate steps and can hand out the same number
   * twice, or a number that was already used and then deleted.
   */
  async next(key: string): Promise<number> {
    const doc = await this.model.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    return doc.seq;
  }
}
