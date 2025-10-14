// DeFire backend v6 - Render-ready (aggregates portfolio data)
// Uses tronweb ^4.1.0
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const TronWeb = require('tronweb');
const app = express();
app.use(cors()); app.use(bodyParser.json());
const fullNode='https://api.trongrid.io', solidityNode='https://api.trongrid.io', eventServer='https://api.trongrid.io';
const tronWeb = new TronWeb(fullNode, solidityNode, eventServer);
app.get('/', (req,res)=> res.send('DeFire backend v6 OK'));
app.post('/fetchPortfolio', async (req,res)=>{
  try{ const wallets = req.body.wallets || []; if(!Array.isArray(wallets)||wallets.length===0) return res.json({ok:false,error:'no wallets'});
    const trxUsd = await getTrxUsd(); let totalUsd=0; const details={};
    for(const addr of wallets){ details[addr]=await computeWallet(addr,trxUsd); totalUsd+=details[addr].totalUsd||0; }
    res.json({ok:true,totalUsd,details});
  }catch(e){ console.error(e); res.json({ok:false,error:e.message}); }
});
async function computeWallet(addr,trxUsd){ const out={address:addr,trx:0,trxUsd:0,tokens:[],unpriced:[],totalUsd:0}; try{ const bal = await tronWeb.trx.getBalance(addr); const trxNum = Number(BigInt(String(bal))/1000000n); out.trx=trxNum; out.trxUsd = trxUsd?trxNum*trxUsd:0; out.totalUsd+=out.trxUsd||0; try{ const r = await axios.get(`https://apilist.tronscanapi.com/api/account/tokens?limit=500&address=${addr}`); const list = r.data.data||r.data.tokens||[]; for(const t of list){ const decimals = Number(t.tokenDecimal ?? t.decimals ?? 6); const raw = t.balance ?? t.amount ?? t.quantity ?? 0; const units = Number(raw)/Math.pow(10,decimals); if(units<=0) continue; const priceUsd = t.price_usd ?? t.price ?? null; if(priceUsd){ out.tokens.push({symbol:t.tokenAbbr||t.symbol,name:t.tokenName||t.name,units,usd:units*priceUsd,contract:t.tokenId||t.contract_address}); out.totalUsd += units*priceUsd; } else out.unpriced.push({symbol:t.tokenAbbr||t.symbol,name:t.tokenName||t.name,units,contract:t.tokenId||t.contract_address}); } }catch(e){ console.warn('tronscan tokens failed',e.message); } }catch(e){ console.error('computeWallet error',e.message); } return out; }
async function getTrxUsd(){ try{ const r = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd'); return r.data.tron.usd; }catch(e){ return null; } }
const PORT = process.env.PORT || 8899; app.listen(PORT, ()=> console.log('DeFire backend listening on', PORT));
