'use strict';
/** Minimal RFC 6455 WebSocket server for this self-contained dev server.
 * Supports masked browser frames, ping/pong, 16/64-bit lengths and disconnect.
 * Production can replace this adapter with `ws` without touching room rules.
 */
const crypto = require('node:crypto');
const MAX_FRAME = 8 * 1024 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const len = body.length;
  let header;
  if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
  else if (len <= 65535) { header = Buffer.alloc(4); header[0]=0x80|opcode; header[1]=126; header.writeUInt16BE(len,2); }
  else { header = Buffer.alloc(10); header[0]=0x80|opcode; header[1]=127; header.writeBigUInt64BE(BigInt(len),2); }
  return Buffer.concat([header,body]);
}
function upgrade(request,socket,head,onConnection) {
  const key = request.headers['sec-websocket-key'];
  const version = request.headers['sec-websocket-version'];
  if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket' ||
      typeof key !== 'string' || Buffer.from(key,'base64').length !== 16 || version !== '13' ||
      request.url !== '/ws') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return;
  }
  const accept = crypto.createHash('sha1').update(key+GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);
  let buffer=Buffer.alloc(0),closed=false;
  const handlers={message:()=>{},close:()=>{}};
  const peer = {
    onMessage(fn) {handlers.message=fn;},
    onClose(fn) {handlers.close=fn;},
    send(value) {
      if (closed || !socket.writable || socket.writableLength > 1024*1024) return false;
      const payload=JSON.stringify(value);
      socket.write(frame(1,payload)); return true;
    },
    close() { if (closed) return; try {socket.write(frame(8));} catch {} socket.end(); },
    get isOpen() {return !closed && !socket.destroyed;},
  };
  function finish(){if (closed)return;closed=true; handlers.close();}
  function feed(data) {
    if (closed) return;
    buffer=Buffer.concat([buffer,data]);
    while (buffer.length >= 2) {
      const byte0=buffer[0], byte1=buffer[1];
      const opcode=byte0 & 0x0f;
      const masked=Boolean(byte1 & 0x80);
      let len=byte1 & 0x7f, pos=2;
      if ((byte0 & 0x70) !== 0 || !masked || (byte0 & 0x80) === 0) { peer.close();return; }
      if (len === 126) { if(buffer.length < 4)return; len=buffer.readUInt16BE(2);pos=4; }
      if (len === 127) {
        if(buffer.length < 10)return;
        const big=buffer.readBigUInt64BE(2);
        if(big > BigInt(MAX_FRAME)) {peer.close();return;}
        len=Number(big);pos=10;
      }
      if (len > MAX_FRAME || (opcode >= 8 && len > 125)) {peer.close();return;}
      if (buffer.length < pos+4+len) return;
      const mask=buffer.subarray(pos,pos+4);pos+=4;
      const payload=Buffer.from(buffer.subarray(pos,pos+len));
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      buffer=buffer.subarray(pos+len);
      if(opcode===8){peer.close();return;}
      if(opcode===9){socket.write(frame(10,payload));continue;}
      if(opcode===10)continue;
      if(opcode!==1){peer.close();return;}
      try{handlers.message(JSON.parse(payload.toString('utf8')));}catch{peer.send({type:'error',message:'Mensaje JSON no válido.'});}
    }
    if(buffer.length > MAX_FRAME+32)peer.close();
  }
  socket.on('data',feed);
  socket.on('error',()=>{socket.destroy();});
  socket.on('close',finish);
  onConnection(peer);
  if(head?.length) feed(head);
}
module.exports={upgrade,frame};
