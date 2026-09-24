import { isAddress } from "@solana/kit";
import { ApiError } from "./api/errors";

/**
 * A guest (payer / buyer) wallet: a base58 address that is not one of our own keys. Our builders
 * would otherwise sign the guest's token transfer with a server key (security backlog).
 */
export function parseGuestWallet(value: string, serverKeys: ReadonlySet<string>): string {
  if (!isAddress(value)) throw new ApiError(400, "INVALID_WALLET", "Wallet must be a base58 Solana address");
  if (serverKeys.has(value)) throw new ApiError(400, "INVALID_WALLET", "This wallet cannot be used to book");
  return value;
}
