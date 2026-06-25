import { ingestOrganizations, ingestMetadata } from './metadata-engine';
import { downloadAndParse, generateMarkdown } from './xlsx-engine';

const phase = process.argv[2] || 'all';
console.log(`Running phase: ${phase}`);

try {
  if (phase === 'organizations' || phase === 'all') {
    console.log('\n=== PHASE: ORGANIZATIONS ===');
    await ingestOrganizations();
  }
  if (phase === 'metadata' || phase === 'all') {
    console.log('\n=== PHASE: METADATA ===');
    await ingestMetadata();
  }
  if (phase === 'download' || phase === 'all') {
    console.log('\n=== PHASE: DOWNLOAD & PARSE ===');
    await downloadAndParse();
  }
  if (phase === 'markdown' || phase === 'all') {
    console.log('\n=== PHASE: MARKDOWN ===');
    await generateMarkdown();
  }
  console.log('\n=== ALL PHASES COMPLETE ===');
  process.exit(0);
} catch (err) {
  console.error('FATAL:', err);
  process.exit(1);
}