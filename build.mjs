import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {standaloneHtml} from './lib/html.mjs';
const root=new URL('./',import.meta.url).pathname;
const result=await build({entryPoints:[root+'entry.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],jsx:'automatic',minify:true,legalComments:'inline',define:{'process.env.NODE_ENV':'"production"'}});
const js=result.outputFiles[0].text;const css=await readFile(root+'app/style.css','utf8');
const html=standaloneHtml(js,css);
const output=new URL('./docs/index.html',import.meta.url);await mkdir(new URL('./docs/',import.meta.url),{recursive:true});await writeFile(output,html);await writeFile(new URL('./docs/.nojekyll',import.meta.url),'');await copyFile(new URL('./lib/bank-template.json',import.meta.url),new URL('./docs/题库导入模板.json',import.meta.url));await writeFile(new URL('./docs/题库模板填写说明.txt',import.meta.url),JSON.parse(await readFile(new URL('./lib/bank-guide.json',import.meta.url),'utf8')));console.log(output.pathname+' ('+Buffer.byteLength(html)+' bytes)');
