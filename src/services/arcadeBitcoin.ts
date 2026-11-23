// Fictional arcade economy only. No prices, payments, accounts or network calls.
export type ArcadeTrade={id:number;label:string;amount:number};
export type ArcadeWallet={version:1;credits:number;btc:number;price:number;history:number[];trades:ArcadeTrade[];armed:number;pending:{id:string;stake:number}|null;notice:string};
const KEY='pb-arcade-bitcoin-v1';
const EVENT='pb-arcade-wallet';
export const initialWallet=():ArcadeWallet=>({version:1,credits:10000,btc:0,price:1000,history:[940,970,950,1020,990,1050,1000],trades:[],armed:0,pending:null,notice:''});
const money=(n:number)=>Math.round(n*100)/100;
export function readArcadeWallet():ArcadeWallet{
  try{const w=JSON.parse(localStorage.getItem(KEY)||'null');
    if(w?.version===1&&[w.credits,w.btc,w.price,w.armed].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&w.price>0&&Array.isArray(w.history)&&w.history.length>=2&&w.history.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&Array.isArray(w.trades)&&w.trades.every((t:ArcadeTrade)=>typeof t.label==='string'&&Number.isFinite(t.amount))&&(!w.pending||(typeof w.pending.id==='string'&&Number.isFinite(w.pending.stake)&&w.pending.stake>0)))return w;
  }catch{/* A blocked or invalid store never affects the game. */}
  return initialWallet();
}
function save(w:ArcadeWallet){
  try{localStorage.setItem(KEY,JSON.stringify(w));window.dispatchEvent(new Event(EVENT));}
  catch{throw new Error('El navegador no permite guardar la simulación. No se ha realizado la operación.');}
  return w;
}
function record(w:ArcadeWallet,label:string,amount:number){w.trades=[{id:Date.now(),label,amount},...w.trades].slice(0,12);return w;}
export function tradeArcade(side:'buy'|'sell',amount:number){
  const w=readArcadeWallet();if(!Number.isFinite(amount)||amount<1||amount!==money(amount))throw new Error('Introduce una cantidad válida.');
  if(side==='buy'){
    if(amount>w.credits-w.armed)throw new Error('No tienes suficientes créditos libres.');
    w.credits=money(w.credits-amount);w.btc+=amount/w.price;
  }else{
    const units=amount/w.price;if(units>w.btc+1e-10)throw new Error('No tienes suficiente BTC ficticio.');
    w.btc=Math.max(0,w.btc-units);w.credits=money(w.credits+amount);
  }
  w.notice=side==='buy'?'Compra simulada guardada.':'Venta simulada guardada.';
  return save(record(w,side==='buy'?'Compra BTC ficticio':'Venta BTC ficticio',side==='buy'?-amount:amount));
}
export function advanceArcadeMarket(random=Math.random()){
  const w=readArcadeWallet();const change=(Math.max(0,Math.min(1,Number.isFinite(random)?random:.5))-.5)*.24;
  w.price=Math.max(50,money(w.price*(1+change)));w.history=[...w.history,w.price].slice(-24);
  w.notice='Nueva ronda de mercado ficticio. El precio no sigue a Bitcoin real.';return save(w);
}
export function armArcadeStake(amount:number){
  const w=readArcadeWallet();if(![0,100,250,500].includes(amount)||amount>w.credits)throw new Error('Saldo insuficiente para ese reto.');
  if(w.pending)throw new Error('Ya hay un reto en curso.');w.armed=amount;w.notice=amount?'Reto preparado para tu próximo 1v1 contra CPU.':'Reto desactivado.';return save(w);
}
export function beginArcadeStake(){
  const w=readArcadeWallet();if(!w.armed||w.pending)return null;
  const stake=Math.min(w.armed,w.credits);if(stake<=0)return null;
  w.credits=money(w.credits-stake);w.armed=0;w.pending={id:globalThis.crypto?.randomUUID?.()||String(Date.now()),stake};
  save(w);return w.pending;
}
export function settleArcadeStake(id:string,result:'win'|'loss'|'refund'){
  const w=readArcadeWallet();if(w.pending?.id!==id)return w;
  const stake=w.pending.stake;const paid=result==='win'?stake*2:result==='refund'?stake:0;
  w.credits=money(w.credits+paid);w.pending=null;
  w.notice=result==='win'?`Reto ganado: +${stake} CR netos.`:result==='loss'?`Reto perdido: −${stake} CR.`:'Reto cancelado o empatado: créditos devueltos.';
  return save(record(w,w.notice,paid-stake));
}
export function recoverArcadeStake(){const w=readArcadeWallet();return w.pending?settleArcadeStake(w.pending.id,'refund'):w;}
export function subscribeArcadeWallet(fn:()=>void){window.addEventListener(EVENT,fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener(EVENT,fn);window.removeEventListener('storage',fn);};}
