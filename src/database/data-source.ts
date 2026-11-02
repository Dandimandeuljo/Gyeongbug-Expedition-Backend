import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/typeorm.config';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL 이 필요합니다.');
}

export default new DataSource(
  buildDataSourceOptions(
    url,
    process.env.DATABASE_SSL === 'true',
    process.env.DATABASE_SSL_CA || undefined,
  ),
);
