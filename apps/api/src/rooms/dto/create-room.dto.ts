import { IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RoomSettingsDto {
  @IsOptional()
  @IsIn(['east', 'east+south'])
  rounds?: 'east' | 'east+south';

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
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
