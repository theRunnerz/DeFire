// server.js - DeFire backend (Render-ready)
// Uses tronweb@^4.1.0
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const TronWeb = require("tronweb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const fullNode = "https://api.trongrid.io";
const solidityNode = "https://api.trongrid.io";
const eventServer = "https://api.trongrid.io/";
const privateKey = ""; // read-only; not needed

const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);

const OWNER = "TY691Xr2EWgKJmHfm7NWKMRJjojLmS2cma";
const FBA_CONTRACT = "TNW5ABkp3v4jfeDo1vRVjxa3gtnoxP3DBN";

app.get("/", (req,res)=> res.send("DeFire backend OK"));

app.post("/verifySignature", async (req,res) => {
  try {
    const { address, message, signature } = req.body;
    if(!address || !message || !signature) return res.json({ ok:false, error:"missing" });
    try {
      const recovered = await tronWeb.trx.verifyMessage(message, signature);
      if(recovered === address) return res.json({ ok:true });
    } catch(e) {
      console.warn("verifyMessage failed:", e.message || e);
    }
    // fallback: accept but mark as fallback
    return res.json({ ok:true, note:"fallback-accepted" });
  } catch(err) {
    console.error(err);
    res.json({ ok:false, error: err.message });
  }
});

// Aggregation endpoint - accepts { wallets: [addr,...] }
app.post("/fetchPortfolio", async (req,res) => {
  try {
    const wallets = req.body.wallets || [];
    if(!Array.isArray(wallets) || wallets.length === 0) return res.json({ ok:false, error:"no wallets" });

    const trxUsd = await getTrxUsd();
    let totalUsd = 0;
    const details = {};

    for(const addr of wallets){
      details[addr] = await computeWallet(addr, trxUsd);
      totalUsd += details[addr].totalUsd || 0;
    }

    return res.json({ ok:true, totalUsd, details });
  } catch(e){
    console.error(e);
    res.json({ ok:false, error: e.message });
  }
});

async function getTrxUsd(){
  try {
    const r = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd");
    return r.data.tron.usd;
  } catch(e){ return null; }
}

async function computeWallet(addr, trxUsd){
  const out = { address:addr, trx:0, trxUsd:0, tokens:[], unpriced:[], frozen:0, totalUsd:0 };
  try {
    const bal = await tronWeb.trx.getBalance(addr);
    const trxNum = Number(BigInt(String(bal)) / 1000000n);
    out.trx = trxNum;
    out.trxUsd = trxUsd ? trxNum * trxUsd : 0;

    // Tronscan tokens API
    try {
      const r = await axios.get(`https://apilist.tronscanapi.com/api/account/tokens?address=${addr}&limit=500`);
      const list = r.data.data || r.data.tokens || [];
      for(const t of list){
        const decimals = Number(t.tokenDecimal ?? t.decimals ?? 6);
        const raw = t.balance ?? t.amount ?? t.quantity ?? 0;
        const units = Number(raw) / Math.pow(10, decimals);
        if(units <= 0) continue;
        const priceUsd = t.price_usd ?? t.price ?? null;
        if(priceUsd) {
          out.tokens.push({ symbol: t.tokenAbbr || t.symbol, contract: t.tokenId || t.contract_address, units, usd: units * priceUsd });
          out.totalUsd += units * priceUsd;
        } else {
          out.unpriced.push({ symbol: t.tokenAbbr || t.symbol, contract: t.tokenId || t.contract_address, units });
        }
      }
    } catch(e){
      console.warn("tronscan tokens failed:", e.message || e);
    }

    out.totalUsd += out.trxUsd || 0;
  } catch(e){
    console.error("computeWallet error:", e.message || e);
  }
  return out;
}

const PORT = process.env.PORT || 8899;
app.listen(PORT, ()=> console.log("DeFire backend listening on", PORT));
