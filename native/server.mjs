import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,extname } from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { NativeProviders } from './providers.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};
export async function startCompanion({port=4187,project=process.cwd(),providers=new NativeProviders({project})}={}){
  const secret=randomBytes(32).toString('hex');let origin;
  const equal=(value,expected)=>typeof value==='string'&&Buffer.byteLength(value)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));
  const server=createServer(async(req,res)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'"};
    const json=(status,value)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(req.headers.host!==new URL(origin).host || (req.headers.origin&&req.headers.origin!==origin)){json(403,{error:'Local origin required.'});return;}
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/api/')){
        const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('threadrail='))?.slice(11);
        if(!equal(cookie,secret)||req.headers['x-threadrail']!=='local'){json(403,{error:'Open ThreadRail Local in this browser first.'});return;}
        if(req.method!=='POST'){json(405,{error:'Use POST.'});return;}
        req.setEncoding('utf8');let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192){json(413,{error:'Request too large.'});return;}}
        const args=JSON.parse(body||'{}');
        if(url.pathname==='/api/list')json(200,await providers.list(args.provider,{cursor:args.cursor,allProjects:args.allProjects===true}));
        else if(url.pathname==='/api/read')json(200,await providers.read(args.id));
        else json(404,{error:'Unknown action.'});
        return;
      }
      if(req.method!=='GET'){json(405,{error:'Use GET.'});return;}
      let file;
      if(url.pathname==='/'){file=resolve(root,'native/public/index.html');headers['Set-Cookie']=`threadrail=${secret}; HttpOnly; SameSite=Strict; Path=/`;}
      else if(['/app.js','/style.css'].includes(url.pathname))file=resolve(root,'native/public',url.pathname.slice(1));
      else if(/^\/dist\/(?:native-app\.js|threadrail\.js|embedding-worker\.js|models\/[a-zA-Z0-9_./-]+|runtime\/[a-zA-Z0-9_.-]+)$/.test(url.pathname)&&!url.pathname.includes('..'))file=resolve(root,'.'+url.pathname);
      else{json(404,{error:'Not found.'});return;}
      const data=await readFile(file);res.writeHead(200,{...headers,'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);
    }catch(error){json(error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Build ThreadRail first with npm run build.':error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {server,url:origin,close:()=>new Promise(resolve=>{providers.close();server.closeAllConnections();server.close(resolve);})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];
  const service=await startCompanion({port:args.includes('--port')?Number(option('--port')):4187,project:args.includes('--project')?resolve(option('--project')):process.cwd()});
  console.log(`ThreadRail Local: ${service.url}`);
  const shutdown=()=>service.close().then(()=>process.exit(0));process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
