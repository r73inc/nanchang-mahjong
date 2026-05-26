import { IsString, MinLength } from 'class-validator';

export class FriendTargetDto {
  @IsString()
  @MinLength(1)
  targetSub!: string;
}

export class FriendRequesterDto {
  @IsString()
  @MinLength(1)
  requesterSub!: string;
}
