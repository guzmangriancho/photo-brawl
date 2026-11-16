'use strict';
const http=require('node:http');
const {upgrade}=require('./transport.cjs');
const {handle,closed}=require('./rooms.cjs');
// Render and similar platforms inject PORT; keep ONLINE_PORT for local development.
const PORT=Number(process.env.PORT||process.env.ONLINE_PORT||8787);
const ALLOWED=(process.env.ONLINE_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
function safeOrigin(req){
  const origin=req.headers.origin;
  if(!origin)return true; // CLI clients may not send Origin
  try {
    const source=new URL(origin);
    if(ALLOWED.length)return ALLOWED.includes(source.origin);
    // Local development: same LAN hostname as socket + localhost only.
    const host=(req.headers.host||'').split(':')[0];
    return source.hostname===host && (host==='localhost'||host==='127.0.0.1'||host.endsWith('.local')||/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host));
  }catch{return false;}
}
const server=http.createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,service:'photo-brawl-online',protocol:1}));return;
  }
  res.writeHead(404);res.end('Not Found');
});
server.on('upgrade',(req,socket,head)=>{
  if(!safeOrigin(req)) {
    console.warn('[online] WebSocket origin rechazado:',req.headers.origin || '(sin origen)', 'host:',req.headers.host);
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  upgrade(req,socket,head,(peer)=>{
    peer.onMessage(msg=>{try{handle(peer,msg);}catch(err){console.error('[online]',err);peer.send({type:'error',message:'Error interno del servidor.'});}});
    peer.onClose(()=>closed(peer));
  });
});
server.listen(PORT,'0.0.0.0',()=>console.log(`[PHOTO BRAWL] Online listo: ws://localhost:${PORT}/ws · /health`));
function stop(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
