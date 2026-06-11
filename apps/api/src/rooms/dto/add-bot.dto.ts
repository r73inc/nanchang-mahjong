import { IsIn } from 'class-validator';
import type { BotDifficulty } from '@nanchang/shared';

export class AddBotDto {
  @IsIn(['easy', 'normal'])
  difficulty!: BotDifficulty;
}
