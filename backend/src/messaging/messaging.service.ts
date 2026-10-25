import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";
import { WagerService, type WagerInput } from "../wager/wager.service.js";
import { hash } from "../common/hash.js";
import { one, rows } from "../common/database.js";
interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}
interface RequestMessage {
  messageId: string;
  type: string;
  data: WagerInput & { idempotencyKey: string };
}
@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private readonly sqs = new SQSClient({
    region: "us-east-1",
    endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  private requestUrl = "";
  private eventsUrl = "";
  private timers: ReturnType<typeof setInterval>[] = [];
  private busy = false;
  private stopped = false;
  constructor(
    private readonly em: EntityManager,
    private readonly wager: WagerService,
  ) {}
  async onModuleInit() {
    if (process.env.SQS_ENABLED === "false") return;
    try {
      for (const name of [
        "wager-transactions-dlq.fifo",
        "wager-transactions.fifo",
        "wager-events.fifo",
      ]) {
        const attrs: Record<string, string> = {
          FifoQueue: "true",
          ContentBasedDeduplication: "false",
        };
        if (name === "wager-transactions.fifo") {
          await this.sqs.send(
            new GetQueueUrlCommand({
              QueueName: "wager-transactions-dlq.fifo",
            }),
          );
          const arn = `arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo`;
          attrs.RedrivePolicy = JSON.stringify({
            deadLetterTargetArn: arn,
            maxReceiveCount: "5",
          });
        }
        await this.sqs.send(
          new CreateQueueCommand({ QueueName: name, Attributes: attrs }),
        );
      }
      this.requestUrl =
        (
          await this.sqs.send(
            new GetQueueUrlCommand({ QueueName: "wager-transactions.fifo" }),
          )
        ).QueueUrl ?? "";
      this.eventsUrl =
        (
          await this.sqs.send(
            new GetQueueUrlCommand({ QueueName: "wager-events.fifo" }),
          )
        ).QueueUrl ?? "";
    } catch (e) {
      this.logger.warn(`SQS unavailable at startup: ${String(e)}`);
    }
    this.timers.push(
      setInterval(() => {
        void this.tick();
      }, 3000),
    );
  }
  onModuleDestroy() {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.sqs.destroy();
  }
  async ready() {
    try {
      await this.sqs.send(
        new GetQueueUrlCommand({ QueueName: "wager-transactions.fifo" }),
      );
      return true;
    } catch {
      return false;
    }
  }
  private async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      await this.wager.retryPending();
      await this.publish();
      await this.consume();
    } catch (e) {
      this.logger.error(`Worker: ${String(e)}`);
    } finally {
      this.busy = false;
    }
  }
  private async publish() {
    if (!this.eventsUrl) return;
    const pending = await rows<OutboxRow>(
      this.em,
      `select id,aggregate_id,event_type,payload,attempts from outbox_messages where published_at is null and (next_attempt_at is null or next_attempt_at<=now()) order by occurred_at limit 20`,
    );
    for (const item of pending) {
      try {
        await this.sqs.send(
          new SendMessageCommand({
            QueueUrl: this.eventsUrl,
            MessageBody: JSON.stringify(item.payload),
            MessageGroupId: item.aggregate_id,
            MessageDeduplicationId: item.id,
          }),
        );
        await rows(
          this.em,
          `update outbox_messages set published_at=now() where id=? and published_at is null`,
          [item.id],
        );
      } catch (e) {
        await rows(
          this.em,
          `update outbox_messages set attempts=attempts+1,next_attempt_at=now()+(least(300, power(2,least(attempts,8)))::text||' seconds')::interval where id=?`,
          [item.id],
        );
        this.logger.warn(`Outbox retry ${item.id}: ${String(e)}`);
      }
    }
  }
  private async consume() {
    if (!this.requestUrl) return;
    const received = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.requestUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 30,
      }),
    );
    for (const msg of received.Messages ?? []) {
      try {
        const parsed = JSON.parse(msg.Body ?? "") as RequestMessage;
        if (
          parsed.type !== "WagerTransactionRequested" ||
          !parsed.messageId ||
          !parsed.data
        )
          throw new Error("Invalid message");
        const { idempotencyKey, ...payload } = parsed.data;
        const digest = hash(payload);
        const prev = await one<{ payload_hash: string }>(
          this.em,
          `select payload_hash from inbox_messages where consumer_name='wager-consumer' and message_id=?`,
          [parsed.messageId],
        );
        if (prev && prev.payload_hash !== digest)
          throw new Error("Inbox message ID reused with different content");
        if (!prev) {
          await this.wager.submit(payload, idempotencyKey, parsed.messageId);
        }
        await this.sqs.send(
          new DeleteMessageCommand({
            QueueUrl: this.requestUrl,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        );
      } catch (e) {
        this.logger.warn(`Message retry ${msg.MessageId}: ${String(e)}`);
      }
    }
  }
  async enqueue(input: WagerInput, key: string) {
    if (!this.requestUrl) throw new Error("SQS unavailable");
    const messageId = randomUUID();
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.requestUrl,
        MessageBody: JSON.stringify({
          messageId,
          type: "WagerTransactionRequested",
          occurredAt: new Date().toISOString(),
          data: { ...input, idempotencyKey: key },
        }),
        MessageGroupId: input.walletId,
        MessageDeduplicationId: messageId,
      }),
    );
    return { messageId, status: "QUEUED" };
  }
}
