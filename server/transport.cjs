'use strict';
/** RFC 6455 transport for PHOTO BRAWL.
 * Supports masked text messages split over multiple frames, control frames
 * interleaved with fragments, 16/64-bit frame lengths and bounded buffers.
 */
const crypto = require('node:crypto');
const MAX_MESSAGE = 8 * 1024 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(opcode, payload=Buffer.alloc(0)) {
  const body=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
  const len=body.length;
  let header;
  if(len<126)header=Buffer.from([0x80|opcode,len]);
  else if(len<=65535){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(len,2);}
  else {header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([header,body]);
}
function upgrade(request,socket,head,onConnection){
  const key=request.headers['sec-websocket-key'];
  const version=request.headers['sec-websocket-version'];
  if(request.method!=='GET'||request.headers.upgrade?.toLowerCase()!=='websocket'||
      typeof key!=='string'||Buffer.from(key,'base64').length!==16||version!=='13'||request.url!=='/ws'){
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;
  }
  const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);
  let buffer=Buffer.alloc(0),closed=false;
  let fragments=[],fragmentBytes=0,fragmenting=false;
  const handlers={message:()=>{},close:()=>{}};
  const peer={
    onMessage(fn){handlers.message=fn;},onClose(fn){handlers.close=fn;},
    send(value){
      if(closed||!socket.writable||socket.writableLength>1024*1024)return false;
      socket.write(frame(1,JSON.stringify(value)));return true;
    },
    close(code=1000){
      if(closed)return;
      try {const payload=Buffer.alloc(2);payload.writeUInt16BE(code);socket.write(frame(8,payload));}catch{}
      socket.end();
    },
    get isOpen(){return !closed&&!socket.destroyed;}
  };
  function finish(){if(closed)return;closed=true;fragments=[];fragmentBytes=0;handlers.close();}
  function fail(reason,code=1002){
    console.warn('[online] Frame WebSocket rechazado:',reason);
    peer.close(code);
  }
  function emitMessage(payload){
    try {handlers.message(JSON.parse(payload.toString('utf8')));}
    catch {peer.send({type:'error',message:'Mensaje JSON no válido.'});}
  }
  function feed(data){
    if(closed)return;
    buffer=Buffer.concat([buffer,data]);
    while(buffer.length>=2){
      const byte0=buffer[0],byte1=buffer[1];
      const fin=Boolean(byte0&0x80),opcode=byte0&15,masked=Boolean(byte1&0x80);
      let len=byte1&127,pos=2;
      if((byte0&0x70)!==0||!masked){fail('flags o máscara inválida');return;}
      if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);pos=4;}
      if(len===127){
        if(buffer.length<10)return;
        const big=buffer.readBigUInt64BE(2);
        if(big>BigInt(MAX_MESSAGE)){fail('frame demasiado grande',1009);return;}
        len=Number(big);pos=10;
      }
      if(len>MAX_MESSAGE){fail('frame demasiado grande',1009);return;}
      const control=opcode>=8;
      if(control&&(!fin||len>125)){fail('frame de control inválido');return;}
      if(buffer.length<pos+4+len)return;
      const mask=buffer.subarray(pos,pos+4);pos+=4;
      const payload=Buffer.from(buffer.subarray(pos,pos+len));
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
      buffer=buffer.subarray(pos+len);
      if(opcode===8){
        if(len===1){fail('close inválido');return;}
        if(!closed){try{socket.write(frame(8,payload));}catch{}socket.end();}return;
      }
      if(opcode===9){socket.write(frame(10,payload));continue;}
      if(opcode===10)continue;
      if(opcode===1){
        if(fragmenting){fail('nuevo texto antes de completar mensaje');return;}
        if(fin){emitMessage(payload);continue;}
        fragmenting=true;fragments=[payload];fragmentBytes=payload.length;
      }else if(opcode===0){
        if(!fragmenting){fail('continuación sin mensaje inicial');return;}
        fragmentBytes+=payload.length;
        if(fragmentBytes>MAX_MESSAGE){fail('mensaje demasiado grande',1009);return;}
        fragments.push(payload);
        if(fin){
          const message=Buffer.concat(fragments,fragmentBytes);
          fragmenting=false;fragments=[];fragmentBytes=0;
          emitMessage(message);
        }
      }else{fail('opcode no soportado');return;}
    }
    if(buffer.length>MAX_MESSAGE+32)fail('buffer demasiado grande',1009);
  }
  socket.on('data',feed);
  socket.on('error',err=>{console.warn('[online] socket:',err.message);socket.destroy();});
  socket.on('close',finish);
  onConnection(peer);
  if(head?.length)feed(head);
}
module.exports={upgrade,frame};
