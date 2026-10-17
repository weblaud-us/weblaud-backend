import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

export class HashUtil {
  private static readonly SALT_ROUNDS = 12;

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * CSPRNG-backed (crypto.randomBytes), not Math.random() — Math.random()'s
   * output is not cryptographically unpredictable and must never back a
   * security token (invite tokens, password-reset tokens, session
   * identifiers, ...). See UsersService's invite-token generation, which
   * uses randomBytes directly for exactly this reason. hex encoding is used
   * rather than an alphabet-indexed loop so the output has no modulo bias.
   */
  static generateRandomToken(length: number = 32): string {
    return randomBytes(length).toString('hex').slice(0, length);
  }
}
