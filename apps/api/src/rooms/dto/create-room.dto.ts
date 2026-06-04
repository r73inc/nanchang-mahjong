import { IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RoomSettingsDto {
  @IsOptional()
  @IsIn(['east', 'east+south'])
  rounds?: 'east' | 'east+south';

  @IsOptional()
  @IsIn(['rounds', 'bust'])
  terminationType?: 'rounds' | 'bust';

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
  @IsInt()
  @Min(1)
  @Max(8)
  minFan?: number;
}

export class CreateRoomDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsDto)
  settings?: RoomSettingsDto;
}
