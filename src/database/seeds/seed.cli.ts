import dataSource from '../data-source';
import { runContentSeeds } from './run-content-seeds';
import { runSeeds } from './run-seeds';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await runSeeds(dataSource);
    await runContentSeeds(dataSource);
    console.log('시드를 적용했습니다.');
  } finally {
    await dataSource.destroy();
  }
}

void main();
