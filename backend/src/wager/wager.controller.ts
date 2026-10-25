import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { WagerService, type WagerInput } from "./wager.service.js";
@Controller()
export class WagerController {
  constructor(private readonly service: WagerService) {}
  @Post("wagering/transactions") submit(
    @Body() input: WagerInput,
    @Headers("idempotency-key") key: string,
  ) {
    return this.service.submit(input, key);
  }
  @Get("wagering/transactions/:id") find(@Param("id") id: string) {
    return this.service.findById(id);
  }
  @Get("providers/:providerId/wagering/transactions/:externalId") provider(
    @Param("providerId") provider: string,
    @Param("externalId") external: string,
  ) {
    return this.service.findByProvider(provider, external);
  }
}
