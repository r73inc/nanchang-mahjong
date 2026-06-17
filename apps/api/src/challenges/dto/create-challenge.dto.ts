import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChallengeBotConfigDto {
  @IsIn(['easy', 'normal'])
  difficulty!: 'easy' | 'normal';
}

export class ChallengeGameConfigDto {
  @IsInt()
  @Min(1)
  @Max(4)
  numRounds!: 1 | 2 | 3 | 4;

  @IsIn(['easy', 'normal', 'hard', 'psychic'])
  botDifficulty!: 'easy' | 'normal' | 'hard' | 'psychic';

  @IsInt()
  @Min(0)
  @Max(1000)
  startingScore!: number;

  @IsInt()
  @Min(5)
  @Max(60)
  timerSecs!: number;

  @IsIn(['2D', '3D'])
  viewMode!: '2D' | '3D';

  @IsBoolean()
  ruleTopBottomJing!: boolean;

  @IsInt()
  @Min(0)
  @Max(60)
  claimWindowSecs!: number;
}

export class CreateChallengeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  challengedSubs!: string[];

  @ValidateNested()
  @Type(() => ChallengeGameConfigDto)
  config!: ChallengeGameConfigDto;
}
