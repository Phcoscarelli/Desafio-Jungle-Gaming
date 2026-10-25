import { Module } from "@nestjs/common";
import { MessagingService } from "./messaging.service.js";
import { WagerModule } from "../wager/wager.module.js";
import { MessagingController } from "./messaging.controller.js";
@Module({
  imports: [WagerModule],
  providers: [MessagingService],
  controllers: [MessagingController],
  exports: [MessagingService],
})
export class MessagingModule {}
