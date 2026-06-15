import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BotConfigDto {
  @IsInt()
  @Min(0)
  @Max(3)
  count!: number;

  @IsIn(['easy', 'normal'])
  difficulty!: 'easy' | 'normal';
}

export class RoomSettingsDto {
  @IsOptional()
  @IsIn(['east', 'east+south', 'east+south+west', 'all'])
  rounds?: 'east' | 'east+south' | 'east+south+west' | 'all';

  @IsOptional()
  @IsIn(['rounds', 'bust', 'fixed-hands'])
  terminationType?: 'rounds' | 'bust' | 'fixed-hands';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  maxHands?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  startingScore?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  timerSecs?: number;

  @IsOptional()
  @IsIn(['2D', '3D'])
  viewMode?: '2D' | '3D';

  @IsOptional()
  @IsBoolean()
  ruleTopBottomJing?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  claimWindowSecs?: number;
}

export class CreateRoomDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsDto)
  settings?: RoomSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BotConfigDto)
  bots?: BotConfigDto;
}
