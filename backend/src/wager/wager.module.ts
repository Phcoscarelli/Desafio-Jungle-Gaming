import { Module } from '@nestjs/common';
import { WagerService } from './wager.service.js';
import { WagerController } from './wager.controller.js';
@Module({controllers:[WagerController],providers:[WagerService],exports:[WagerService]})
export class WagerModule {}
