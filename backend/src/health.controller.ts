import { Controller, Get } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { MessagingService } from "./messaging/messaging.service.js";
@Controller("health")
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    private readonly messaging: MessagingService,
  ) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    let postgres = false;
    try {
      await this.em.execute("select 1");
      postgres = true;
    } catch {}
    const sqs = await this.messaging.ready();
    return { status: postgres && sqs ? "ready" : "degraded", postgres, sqs };
  }
}
