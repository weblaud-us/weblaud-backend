import { PartialType } from '@nestjs/mapped-types';
import { CreateContractDto } from './create-contract.dto';

/**
 * No `status` field here on purpose. `accepted` can only be reached through
 * ContractService.accept() (it requires an ip/userAgent/signature record);
 * allowing it here would let a PATCH silently mark a contract "accepted"
 * with no acceptance evidence at all. `sent`/`void` go through their own
 * endpoints for the same reason — each is a distinct, audit-logged event.
 */
export class UpdateContractDto extends PartialType(CreateContractDto) {}
