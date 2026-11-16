'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'..');
const PORT=18937;
const png='data:image/png;base64,'+'A'.repeat(60000);
function maskedFrame(opcode,fin,payload){
  const data=Buffer.from(payload);const len=data.length;
  const header=Buffer.alloc(len<126?2:len<65536?4:10);
  header[0]=(fin?128:0)|opcode;
  if(len<126)header[1]=128|len;
  else if(len<65536){header[1]=254;header.writeUInt16BE(len,2);}
  else {header[1]=255;header.writeBigUInt64BE(BigInt(len),2);}
  const mask=crypto.randomBytes(4),body=Buffer.from(data);
  for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
  return Buffer.concat([header,mask,body]);
}
function profile(){return {
  id:'fragment-test',fighterName:'FRAGMENTADO',archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',
  stats:{hp:25,speed:25,power:25,technique:25},
  moveset:{
    lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'OVERHEAD_SMASH'},
    specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL'},
    specialForward:{name:'RUSH',mechanic:'ARMORED_SHOULDER_DASH'},
    specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT'},
    ultimateSuper:{name:'SUPER',mechanic:'MULTI_HIT_RUSH_COMBO'}
  },spriteSheetDataUrl:png,portraitDataUrl:'data:image/png;base64,AAAA'
};}
test('server accepts large fragmented masked WebSocket create with interleaved ping',async()=>{
  const child=spawn(process.execPath,['server/index.cjs'],{cwd:root,env:{...process.env,ONLINE_PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
  try{
    let up=false;
    for(let i=0;i<60;i++){
      try{const r=await fetch(`http://127.0.0.1:${PORT}/health`);if(r.ok){up=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,60));
    }
    assert.ok(up,'server should start');
    const socket=net.connect(PORT,'127.0.0.1');
    const key=crypto.randomBytes(16).toString('base64');
    socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`);
    let handshake=false,buffer=Buffer.alloc(0);
    const responses=[];
    const got=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('welcome timed out; received '+JSON.stringify(responses))),4000);
      socket.on('data',chunk=>{
        buffer=Buffer.concat([buffer,chunk]);
        if(!handshake){const p=buffer.indexOf('\r\n\r\n');if(p<0)return;
          assert.match(buffer.subarray(0,p).toString(),/101 Switching Protocols/);buffer=buffer.subarray(p+4);handshake=true;
          const msg=Buffer.from(JSON.stringify({type:'create',stage:'SKI_RESORT',profile:profile()}));
          assert.ok(msg.length>60000);
          socket.write(maskedFrame(1,false,msg.subarray(0,20000)));
          socket.write(maskedFrame(9,true,Buffer.from('ping')));
          socket.write(maskedFrame(0,false,msg.subarray(20000,40000)));
          socket.write(maskedFrame(0,true,msg.subarray(40000)));
        }
        while(buffer.length>=2){
          const b=buffer[1],n=b&127;let len=n,offset=2;
          if(n===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);offset=4;}
          if(n===127){if(buffer.length<10)return;len=Number(buffer.readBigUInt64BE(2));offset=10;}
          if(buffer.length<offset+len)return;
          const opcode=buffer[0]&15;
          const data=buffer.subarray(offset,offset+len);buffer=buffer.subarray(offset+len);
          if(opcode===8){clearTimeout(timer);reject(new Error('server closed connection'));return;}
          if(opcode===1){const v=JSON.parse(data.toString());responses.push(v.type);if(v.type==='welcome'){clearTimeout(timer);resolve(v);return;}}
        }
      });
      socket.on('error',reject);
    });
    const welcome=await got;
    assert.match(welcome.code,/^[A-Z2-9]{6}$/);
    socket.destroy();
  }finally{child.kill();}
});
