import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await mkdir('release', { recursive: true });
// The archive contains only the distributable extension, never development dependencies.
const files = await readdir('dist');
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
await rm(`release/threadrail-${version}.zip`, { force: true });
execFileSync('zip', ['-q', '-r', `../release/threadrail-${version}.zip`, ...files], { cwd: 'dist' });
console.log(`Packaged release/threadrail-${version}.zip`);
