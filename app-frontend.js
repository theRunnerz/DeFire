/** app-frontend.js (JSX) - React-style UI loaded by Babel in index.html
 * - Sign-in with TronLink (signMessageV2 fallback)
 * - Whitelist: owner OR >=1000 FBA (contract TNW5...)
 * - Portfolio fetch: tries backend (if configured), otherwise tronscan fallback
 */

const { useState, useEffect, useRef } = React;

const OWNER_WALLET = "TY691Xr2EWgKJmHfm7NWKMRJjojLmS2cma";
const FBA_CONTRACT = "TNW5ABkp3v4jfeDo1vRVjxa3gtnoxP3DBN";
const MIN_FBA = 1000;

function App() {
  const [connected, setConnected] = useState(null);
  const [status, setStatus] = useState("Not connected");
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [walletsText, setWalletsText] = useState(localStorage.getItem("defire_wallets")||"");
  const [grand, setGrand] = useState(null);
  const [debug, setDebug] = useState("Ready");
  const [activeTab, setActiveTab] = useState("net");
  const backendRef = useRef(localStorage.getItem("defire_backend") || "");

  useEffect(()=> {
    // auto try to detect TronLink injection after load
    setTimeout(()=> {
      if(window.tronWeb && window.tronWeb.ready) {
        setStatus("TronLink available — click Connect");
      }
    }, 300);
  }, []);

  async function connectWallet(){
    if(!(window.tronWeb && window.tronWeb.ready)){
      setStatus("Open site inside TronLink browser / extension and unlock TronLink");
      alert("Please open in TronLink in-app browser or unlock TronLink.");
      return;
    }
    const tw = window.tronWeb;
    const addr = tw.defaultAddress.base58;
    setConnected(addr);
    setStatus("Connected: " + addr);
    localStorage.setItem("defire_connected", addr);
    setDebug("Connected: " + addr);
    // sign challenge
    const message = `DeFire v5 login:${addr}@${Date.now()}`;
    try {
      let signature = null;
      if(tw.trx && typeof tw.trx.signMessageV2 === "function") {
        signature = await tw.trx.signMessageV2(message);
      } else if(tw.trx && typeof tw.trx.sign === "function") {
        const enc = new TextEncoder();
        const bytes = enc.encode(message);
        const hex = "0x" + Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
        signature = await tw.trx.sign(hex);
      }
      if(signature){
        localStorage.setItem("defire_sig", JSON.stringify({message, signature}));
      }
    } catch(err){
      console.warn("Sign failed:", err);
    }
    await checkFbaWhitelist(addr);
    // auto compute net worth
    computeNetWorth();
  }

  async function checkFbaWhitelist(address){
    try {
      if(address === OWNER_WALLET) {
        setIsWhitelisted(true);
        setDebug(prev=> prev + "\nOwner whitelisted");
        return true;
      }
      // attempt contract call via TronWeb
      if(window.tronWeb && window.tronWeb.ready) {
        const c = await window.tronWeb.contract().at(FBA_CONTRACT);
        const raw = await c.balanceOf(address).call();
        let dec = 6;
        try { dec = Number((await c.decimals().call()).toString()); } catch(e){ dec = 6; }
        const bal = convertBigIntToNumber(raw, dec);
        setDebug(prev => prev + `\nFBA balance: ${bal}`);
        if(bal >= MIN_FBA) { setIsWhitelisted(true); return true; }
      }
    } catch(e){
      console.warn("FBA check error", e);
      setDebug(prev => prev + `\nFBA check error: ${e.message || e}`);
    }
    setIsWhitelisted(false);
    return false;
  }

  async function computeNetWorth(){
    setDebug("Computing...");
    const wallets = walletsText.split("\n").map(s=>s.trim()).filter(Boolean);
    const target = wallets.length ? wallets : (connected ? [connected] : []);
    if(target.length === 0) { alert("Connect wallet or enter addresses."); return; }
    localStorage.setItem("defire_wallets", walletsText);
    const backendUrl = backendRef.current || "";
    // try backend first
    if(backendUrl){
      try{
        const r = await fetch(backendUrl + "/fetchPortfolio", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ wallets: target })
        });
        const j = await r.json();
        if(j && j.ok){
          setGrand(j.totalUsd);
          setDebug(JSON.stringify(j.details, null, 2));
          return;
        } else {
          setDebug("Backend returned non-ok: " + JSON.stringify(j));
        }
      } catch(e) {
        setDebug("Backend fetch failed: " + e.toString());
      }
    }
    // fallback: client-side via Tronscan + Coingecko
    const trxUsd = await getTrxUsd();
    let totalUsd = 0;
    const details = {};
    for(const w of target){
      details[w] = { totalUsd: 0 };
      try {
        if(window.tronWeb && window.tronWeb.ready){
          const b = await window.tronWeb.trx.getBalance(w);
          const trx = Number(BigInt(String(b)) / 1000000n);
          details[w].totalUsd += (trxUsd ? trx * trxUsd : 0);
        }
        // tokens via Tronscan API
        const res = await fetch(`https://apilist.tronscanapi.com/api/account/tokens?address=${w}&limit=500`);
        const j2 = await res.json();
        const list = j2?.data || j2?.tokens || [];
        for(const t of list){
          const dec = Number(t.tokenDecimal ?? t.decimals ?? 6);
          const raw = t.balance ?? t.amount ?? t.quantity ?? 0;
          const units = Number(raw) / Math.pow(10, dec);
          if(units <= 0) continue;
          const price = t.price_usd ?? t.price ?? null;
          if(price) details[w].totalUsd += units * price;
          else details[w].unpriced = details[w].unpriced || [], details[w].unpriced.push({ symbol: t.tokenAbbr||t.symbol, units, contract: t.tokenId||t.contract_address});
        }
      } catch(err){
        console.warn("wallet compute error", err);
      }
      totalUsd += details[w].totalUsd || 0;
    }
    setGrand(totalUsd);
    setDebug(JSON.stringify(details, null, 2));
  }

  return (
    <div className="app-root">
      <header className="header">
        <div className="brand logo-animate">DeFire <span className="emoji">👽🔥</span></div>
        <div className="controls">
          <button className="icon-btn" onClick={() => {
            const a = document.getElementById("fireAudio");
            a.muted = !a.muted;
            a.muted ? (a.pause && a.pause()) : (a.play && a.play());
          }}>🔊</button>
          <button className="btn" onClick={connectWallet}>{connected ? connected.slice(0,6) + "..." : "Connect Wallet 🔥"}</button>
        </div>
      </header>

      <main className="container">
        <nav className="tabs">
          <button className={"tab " + (activeTab==="net" ? "active" : "")} onClick={()=>setActiveTab("net")}>🔥 Net Worth</button>
          <button className={"tab " + (activeTab==="wallets" ? "active" : "")} onClick={()=>setActiveTab("wallets")}>💼 Wallets</button>
          <button className={"tab " + (activeTab==="settings" ? "active" : "")} onClick={()=>setActiveTab("settings")}>⚙️ Settings</button>
        </nav>

        {activeTab==="net" && (
          <section className="panel">
            <div className="card">
              <h2>Grand Total</h2>
              <div className="grand">{grand === null ? "—" : formatUSD(grand)}</div>
              <div className="small">Status: {status} {isWhitelisted ? " • Whitelisted" : ""}</div>
            </div>
            <div className="card">
              <h3>Details</h3>
              <pre className="small">{debug}</pre>
            </div>
            <div className="row">
              <button className="btn" onClick={computeNetWorth}>Refresh Now</button>
            </div>
          </section>
        )}

        {activeTab==="wallets" && (
          <section className="panel">
            <div className="card">
              <h3>Manage Wallets</h3>
              <textarea value={walletsText} onChange={(e)=>setWalletsText(e.target.value)} placeholder="One address per line"></textarea>
              <div className="row">
                <button className="btn" onClick={computeNetWorth}>Calculate Net Worth</button>
                <div className="pill">Saved wallets: { (walletsText.match(/\n/g) || []).length + (walletsText.trim() ? 1 : 0) }</div>
              </div>
            </div>
          </section>
        )}

        {activeTab==="settings" && (
          <section className="panel">
            <div className="card">
              <h3>Settings</h3>
              <div className="row"><label>Backend URL</label><input type="text" defaultValue={backendRef.current} onBlur={(e)=>{ backendRef.current = e.target.value; localStorage.setItem("defire_backend", e.target.value); }} placeholder="https://your-backend.onrender.com" /></div>
              <div className="row"><label>Whitelisted owner</label><div className="pill">{OWNER_WALLET}</div></div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">Made with ❤️ by FootballAlien$ — Neon green</footer>
    </div>
  );
}

/* Helpers */
function convertBigIntToNumber(raw, decimals){
  try {
    const s = raw && raw._hex ? raw._hex : (raw && raw.toString ? raw.toString() : raw);
    const bi = BigInt(s.toString());
    const scale = 10n ** BigInt(decimals);
    const intPart = bi / scale;
    const frac = bi % scale;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0,6).replace(/0+$/,'');
    return Number(fracStr ? `${intPart.toString()}.${fracStr}` : `${intPart.toString()}`);
  } catch(e) { return 0; }
}

async function getTrxUsd(){
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd");
    const j = await r.json();
    return j?.tron?.usd || null;
  } catch(e){ return null; }
}

function formatUSD(n){
  return (typeof n === "number" ? n : 0).toLocaleString(undefined, {style:"currency", currency:"USD", maximumFractionDigits:2});
}

/* Render to DOM */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
