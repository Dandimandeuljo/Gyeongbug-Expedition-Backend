import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Region } from './region.entity';

@Entity('region_quiz')
@Check(
  'ck_region_quiz_choices',
  `jsonb_typeof("choices") = 'array' AND jsonb_array_length("choices") = 4`,
)
@Check('ck_region_quiz_answer_index', '"answer_index" BETWEEN 0 AND 3')
export class RegionQuiz {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'int' })
  regionId!: number;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb' })
  choices!: string[];

  @Column({ type: 'int' })
  answerIndex!: number;

  @Column({ type: 'text' })
  explanation!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  source!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
