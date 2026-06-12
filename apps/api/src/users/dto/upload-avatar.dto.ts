import { IsString, Matches, MaxLength } from 'class-validator';

export class UploadAvatarDto {
  /** Base64-encoded image data (no data-URI prefix). */
  @IsString()
  @MaxLength(2_000_000, { message: 'Image too large' })
  imageData!: string;

  /** MIME type — must be image/jpeg or image/png. */
  @IsString()
  @Matches(/^image\/(jpeg|png)$/, { message: 'Only JPEG and PNG images are supported' })
  contentType!: string;
}
