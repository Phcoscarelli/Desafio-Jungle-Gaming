import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { WalletService, type CreateWalletInput } from "./wallet.service.js";

@Controller("wallets")
export class WalletController {
  constructor(private readonly service: WalletService) {}
  @Post() create(@Body() input: CreateWalletInput) {
    return this.service.createWallet(input);
  }
  @Get(":walletId/ledger") ledger(
    @Param("walletId") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.ledger(id, cursor, limit ? Number(limit) : 50);
  }
  @Post(":walletId/reconciliation") reconciliation(
    @Param("walletId") id: string,
  ) {
    return this.service.reconcile(id);
  }
  @Get(":walletId") findById(@Param("walletId") id: string) {
    return this.service.findById(id);
  }
}
