import { Body, Controller, Headers, Post } from '@nestjs/common';
import { MessagingService } from './messaging.service.js';
import type { WagerInput } from '../wager/wager.service.js';
@Controller('queue')
export class MessagingController {constructor(private readonly messaging:MessagingService){}
 @Post('transactions') enqueue(@Body() input:WagerInput,@Headers('idempotency-key') key:string){return this.messaging.enqueue(input,key);}
}
