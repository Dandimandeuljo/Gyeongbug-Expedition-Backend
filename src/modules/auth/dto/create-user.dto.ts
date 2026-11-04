import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsString,
  Length,
  Matches,
  registerDecorator,
} from 'class-validator';
import {
  BANNED_WORDS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from '../../settlement/game-rules.constants';

function NotBannedWord() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'notBannedWord',
      target: target.constructor,
      propertyName,
      options: { message: 'BANNED_WORD' },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          !BANNED_WORDS.some((word) => value.toLowerCase().includes(word)),
      },
    });
  };
}

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined({ message: 'LENGTH' })
  @IsString({ message: 'LENGTH' })
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH, { message: 'LENGTH' })
  @Matches(/^[가-힣A-Za-z0-9]+$/, { message: 'CHARSET' })
  @NotBannedWord()
  name!: string;
}
