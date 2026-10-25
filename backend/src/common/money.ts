import { BadRequestException } from "@nestjs/common";
export interface MoneyDto {
  amount: string;
  currency: string;
}
export function cents(value: string, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,15})\.\d{2}$/.test(value))
    throw new BadRequestException(
      "Amount must be a positive decimal string with two digits",
    );
  const [whole, decimal] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal);
  if (!allowZero && result === 0n)
    throw new BadRequestException("Amount must be positive");
  return result;
}
export function decimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function money(input: unknown, allowZero = false): MoneyDto {
  if (!input || typeof input !== "object")
    throw new BadRequestException("money object required");
  const obj = input as Record<string, unknown>;
  if (typeof obj.currency !== "string" || !/^[A-Z]{3}$/.test(obj.currency))
    throw new BadRequestException("Invalid currency");
  cents(obj.amount as string, allowZero);
  return { amount: obj.amount as string, currency: obj.currency };
}
