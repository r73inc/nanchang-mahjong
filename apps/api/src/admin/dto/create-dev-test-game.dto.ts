import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  IsBoolean,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { TestWinCondition } from '../../game/game-session';

const TEST_WIN_CONDITIONS: TestWinCondition[] = [
  'immediate',
  'self_draw',
  'left_discard',
  'right_discard',
];

export class MeldDto {
  @IsEnum(['chow', 'pung', 'kong'])
  kind!: 'chow' | 'pung' | 'kong';

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(4)
  tiles!: string[];

  @IsBoolean()
  concealed!: boolean;
}

export class CreateDevTestGameDto {
  /** The admin's closed waiting hand (tile type strings).
   * Length = 13 − openMelds.length × 3 (each meld takes 3 slots, including kong). */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(13)
  hand!: string[];

  /** Pre-configured open melds for the admin (optional). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeldDto)
  @ArrayMaxSize(4)
  openMelds?: MeldDto[];

  /** How the winning tile will be obtained. */
  @IsEnum(TEST_WIN_CONDITIONS)
  condition!: TestWinCondition;

  /**
   * The tile that completes the hand.
   * Required for self_draw / left_discard / right_discard.
   * For 'immediate', the hand array should already include the winning 14th tile.
   */
  @IsOptional()
  @IsString()
  winTile?: string;
}
