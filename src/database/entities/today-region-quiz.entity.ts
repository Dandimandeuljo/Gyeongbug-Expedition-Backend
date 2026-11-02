import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { RegionQuiz } from './region-quiz.entity';
import { User } from './users.entity';

/** 유저별 오늘 문항. 세트 하나는 3행이며 PK 가 KST 하루 한 세트를 보장합니다. */
@Entity('today_region_quiz')
@Check('ck_today_region_quiz_order_no', '"order_no" BETWEEN 1 AND 3')
@Check('ck_today_region_quiz_selected', '"selected_index" BETWEEN 0 AND 3')
@Check(
  'ck_today_region_quiz_submitted',
  '("selected_index" IS NULL) = ("right_answer" IS NULL) AND ("selected_index" IS NULL) = ("submitted_at" IS NULL)',
)
export class TodayRegionQuiz {
  @PrimaryColumn({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** KST 달력 날짜 YYYY-MM-DD */
  @PrimaryColumn({ type: 'date' })
  date!: string;

  @PrimaryColumn({ type: 'int' })
  orderNo!: number;

  @Column({ type: 'int' })
  quizId!: number;

  @ManyToOne(() => RegionQuiz, { nullable: false })
  @JoinColumn({ name: 'quiz_id' })
  quiz?: RegionQuiz;

  @Column({ type: 'int', nullable: true })
  selectedIndex!: number | null;

  @Column({ type: 'boolean', nullable: true })
  rightAnswer!: boolean | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;
}
