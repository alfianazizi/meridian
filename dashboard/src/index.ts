import { resolve } from 'node:path';
import { openDatabase } from './db/connection.js';
import { buildApp } from './api/app.js';
import fastifyStatic from '@fastify/static';

const host=process.env.DASHBOARD_HOST??'127.0.0.1';
if(host!=='127.0.0.1'&&host!=='::1'&&host!=='localhost')throw new Error('Remote bind is disabled in V1');
const port=Number(process.env.DASHBOARD_PORT??4310);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid dashboard port');
const databasePath=resolve(process.env.DASHBOARD_DB??'data/analytics.sqlite');
const db=openDatabase(databasePath);
const app=buildApp(db);
const frontendRoot=resolve('dist/frontend');
await app.register(fastifyStatic,{root:frontendRoot,prefix:'/',wildcard:false});
app.setNotFoundHandler((request,reply)=>{
  if(request.url.startsWith('/api/'))return reply.status(404).send({error:'Not found'});
  return reply.sendFile('index.html');
});
const shutdown=async()=>{await app.close();db.close();process.exit(0)};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
await app.listen({host,port});
console.log(`Meridian analytics listening on http://${host}:${port}`);
