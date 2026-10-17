import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AUDIT_STRATEGIES, type AuditStrategy } from '../schemas/audit.schema';

export class RunAuditDto {
  // Format is checked by normalizeAuditUrl() in the service, which also
  // accepts a bare "example.com".
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  url: string;

  @IsIn(AUDIT_STRATEGIES)
  strategy: AuditStrategy;
}
