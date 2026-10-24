import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx'];
const expected = JSON.parse(await readFile(new URL('../model-files.json', import.meta.url)));
const records = {};
for (const file of files) {
  const destination = `models/all-MiniLM-L6-v2/${file}`;
  let data;
  try { data = await readFile(destination); } catch {
    const response = await fetch(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/${file}`);
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    await mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
    await writeFile(destination, data);
  }
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== expected.files[file].sha256) throw new Error(`Model integrity check failed: ${file}`);
  records[file] = { bytes: data.length, sha256 };
}
await writeFile('models/manifest.json', JSON.stringify({ model: 'Xenova/all-MiniLM-L6-v2', revision, files: records }, null, 2));
console.log('Prepared packaged semantic-search model. No runtime downloads required.');

for(const manifest of ['retrieval-model-files.json','reranker-files.json']){
const retrieval=JSON.parse(await readFile(new URL(`../${manifest}`,import.meta.url)));
for(const [file,record] of Object.entries(retrieval.files)){
  const destination=`models/${retrieval.model.split('/').at(-1)}/${file}`;let data;
  try{data=await readFile(destination);}catch{
    const response=await fetch(`https://huggingface.co/${retrieval.model}/resolve/${retrieval.revision}/${file}`);
    if(!response.ok)throw Error(`${file}: ${response.status}`);
    data=Buffer.from(await response.arrayBuffer());await mkdir(destination.slice(0,destination.lastIndexOf('/')),{recursive:true});await writeFile(destination,data);
  }
  if(createHash('sha256').update(data).digest('hex')!==record.sha256)throw Error(`Retrieval model integrity check failed: ${file}`);
}
console.log(`Verified packaged ${retrieval.model}.`);
}
