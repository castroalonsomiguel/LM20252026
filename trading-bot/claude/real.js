const fs=require('fs'); const E=require('/home/user/LM20252026/trading-bot/engine.js');
const FILE=__dirname+'/estado_real.json';
const bot=new E.Bot({storage:{load:()=>fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE)):null, save:s=>fs.writeFileSync(FILE,JSON.stringify(s))}});
(async()=>{
 const mode=process.argv[2];
 if(mode==='research'){ await bot.research((f,m)=>{}); }
 if(mode==='test'){ await bot.testTrade('BTC'); }
 if(mode==='tick'){ await bot.tick(); }
 const s=bot.state;
 if(mode==='research'){
  console.log('RANKING'); for(const k of s.ranking){const x=s.studies[k]; console.log([x.rank,k,E.fmtPrice(x.price),E.pct(x.r30),E.pct(x.r90),E.pct(x.r365),'CAGR',E.pct(x.cagr),'vol',(x.volAnn*100).toFixed(0)+'%','DD',E.pct(x.maxDD365,0),'Sh',x.sharpe.toFixed(2),x.trend,'corr',x.corr?.toFixed(2),'score',x.score.toFixed(0),'años',x.years.toFixed(1),'pros:',x.pros.join('/'),'cons:',x.cons.join('/')].join(' | '));}
  console.log('PATRONES'); for(const p of Object.values(s.patterns)) console.log(p.sym,p.sid,p.verdict,p.status,p.tp,p.sl,'train',p.train&&`${p.train.n} ${(p.train.win*100).toFixed(0)}% ${E.pct(p.train.avg,2)}`,'val',p.val&&`${p.val.n} ${(p.val.win*100).toFixed(0)}% ${E.pct(p.val.avg,2)}`);
  console.log('missing',s.missing);
 }
 console.log('OPEN',JSON.stringify(s.open)); console.log('LOG'); s.log.slice(0,8).forEach(l=>console.log(new Date(l.t).toISOString(),l.msg));
})().catch(e=>console.error('ERR',e));
