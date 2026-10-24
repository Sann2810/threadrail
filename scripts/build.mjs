import { build } from 'esbuild';
import { mkdir, copyFile, rm, cp, readdir } from 'node:fs/promises';
import { SEARCH_MODEL } from '../src/search-model.js';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/content.js'], bundle: true, outfile: 'dist/threadrail.js',
  format: 'iife', target: ['chrome111', 'firefox128'], loader: { '.css': 'text' },
  legalComments: 'none',
});
await build({
  entryPoints: ['src/background.js', 'src/popup.js', 'src/options.js', 'src/embedding-worker.js', 'src/library.js', 'src/diagnostics.js'], bundle: true, outdir: 'dist',
  format: 'esm', target: ['chrome111'], legalComments: 'none',
});
await build({entryPoints:['native/public/app.js'],bundle:true,outfile:'dist/native-app.js',format:'esm',target:['chrome111'],legalComments:'none'});
for (const file of ['popup.html', 'options.html', 'library.html', 'diagnostics.html', 'extension.css']) await copyFile(`src/${file}`, `dist/${file}`);
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('README.md', 'dist/README.md');
await copyFile('COMPATIBILITY.md', 'dist/COMPATIBILITY.md');
await copyFile('SEARCH.md', 'dist/SEARCH.md');
await copyFile('LONG_CHAT_TESTS.md', 'dist/LONG_CHAT_TESTS.md');
await copyFile('LIBRARY_TESTS.md', 'dist/LIBRARY_TESTS.md');
await copyFile('NATIVE.md', 'dist/NATIVE.md');


await mkdir('dist/models',{recursive:true});
await cp(`models/${SEARCH_MODEL.id}`, `dist/models/${SEARCH_MODEL.id}`, { recursive: true });
await cp('models/ms-marco-MiniLM-L-6-v2','dist/models/ms-marco-MiniLM-L-6-v2',{recursive:true});
await copyFile('retrieval-model-files.json','dist/models/manifest.json');
await copyFile('reranker-files.json','dist/models/reranker-manifest.json');
await mkdir('dist/runtime', { recursive: true });
for (const file of await readdir('node_modules/onnxruntime-web/dist')) {
  if (file === 'ort-wasm-simd-threaded.asyncify.wasm') await copyFile(`node_modules/onnxruntime-web/dist/${file}`, `dist/runtime/${file}`);
}
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');

await mkdir('dist/licenses', {recursive:true});
await copyFile('node_modules/@huggingface/transformers/LICENSE', 'dist/licenses/transformers-APACHE-2.0.txt');
await copyFile('licenses/onnxruntime-MIT.txt', 'dist/licenses/onnxruntime-MIT.txt');
await copyFile('licenses/bge-MIT.txt', 'dist/licenses/bge-MIT.txt');

console.log('Built ThreadRail → dist/ (including offline search model)');

await copyFile('node_modules/@huggingface/tokenizers/LICENSE', 'dist/licenses/tokenizers-APACHE-2.0.txt');
await copyFile('node_modules/@huggingface/jinja/LICENSE', 'dist/licenses/jinja.txt');
