import { IsString } from 'class-validator';

export class ResetProgressDto {
  @IsString()
  confirmation!: string;
}
