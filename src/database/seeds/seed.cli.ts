import dataSource from '../data-source';
import { runSeeds } from './run-seeds';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await runSeeds(dataSource);
    console.log('시드를 적용했습니다.');
  } finally {
    await dataSource.destroy();
  }
}

void main();
