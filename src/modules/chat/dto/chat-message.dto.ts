import { Transform } from 'class-transformer';
import { IsDefined, IsString, Length } from 'class-validator';

export class ChatMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined()
  @IsString()
  @Length(1, 200)
  message!: string;
}
