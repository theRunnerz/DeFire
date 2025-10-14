// DeFire v6 frontend script — standalone (no Babel). Put as app-frontend.js
(function(){
  const OWNER = "TY691Xr2EWgKJmHfm7NWKMRJjojLmS2cma";
  const FBA_CONTRACT = "TNW5ABkp3v4jfeDo1vRVjxa3gtnoxP3DBN";
  const MIN_FBA = 1000;
  const AUTO_REFRESH_DEFAULT = 30; // seconds
  let tronWeb = window.tronWeb || null;
  let connectedAddr = localStorage.getItem('defire_connected') || null;
  let autoInterval = Number(localStorage.getItem('defire_interval')) || AUTO_REFRESH_DEFAULT;
  let chartInstance = null;

  // Create DOM root
  function createUI(){
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="app-root">
        <header class="header">
          <div class="brand logo-animate">DeFire <span class="emoji">👽🔥</span></div>
          <div class="controls">
            <button id="soundBtn" class="icon-btn">🔇</button>
            <button id="connectBtn" class="btn">${connectedAddr ? short(connectedAddr) : 'Connect Wallet 🔥'}</button>
          </div>
        </header>
        <main class="container">
          <nav class="tabs">
            <button class="tab active" data-tab="net">🔥 Net Worth</button>
            <button class="tab" data-tab="wallets">💼 Wallets</button>
            <button class="tab" data-tab="settings">⚙️ Settings</button>
          </nav>

          <section id="net" class="panel">
            <div class="card">
              <h2>Grand Total</h2>
              <div id="grand" class="grand">—</div>
              <div id="status" class="small">Status: Not connected</div>
            </div>
            <div class="card">
              <h3>Breakdown</h3>
              <div id="tokensList"></div>
              <canvas id="netChart" style="max-height:260px"></canvas>
            </div>
            <div class="row"><button id="refreshBtn" class="btn">Refresh Now</button><div id="progress" class="pill">Idle</div></div>
          </section>

          <section id="wallets" class="panel hidden">
            <div class="card">
              <h3>Manage Wallets</h3>
              <textarea id="walletsText" rows="6" placeholder="Paste TRON addresses, one per line">${localStorage.getItem('defire_wallets')||''}</textarea>
              <div class="row">
                <button id="calcBtn" class="btn">Calculate Net Worth</button>
                <div id="walletCount" class="pill">0 wallets</div>
              </div>
            </div>
          </section>

          <section id="settings" class="panel hidden">
            <div class="card">
              <h3>Settings</h3>
              <div class="row"><label>Auto-refresh (sec)</label><input id="intervalSec" type="number" value="${autoInterval}" min="5"/></div>
              <div class="row"><label>Backend URL (optional)</label><input id="backendUrl" type="text" placeholder="https://your-backend.onrender.com" value="${localStorage.getItem('defire_backend')||''}"/></div>
              <div class="row"><label>Owner wallet</label><div class="pill">${OWNER}</div></div>
            </div>
          </section>

          <div class="card debug-card"><h4>Debug</h4><pre id="debug">Ready</pre></div>
        </main>
        <footer class="footer">Made with ❤️ by FootballAlien$ — Neon green</footer>
      </div>
    `;
    // wire UI events
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click', switchTab));
    document.getElementById('connectBtn').addEventListener('click', connectFlow);
    document.getElementById('refreshBtn').addEventListener('click', triggerRefresh);
    document.getElementById('calcBtn').addEventListener('click', triggerRefresh);
    document.getElementById('intervalSec').addEventListener('change', (e)=>{ localStorage.setItem('defire_interval', e.target.value); autoInterval = Number(e.target.value); resetAutoRefresh(); });
    document.getElementById('backendUrl').addEventListener('blur', (e)=>{ localStorage.setItem('defire_backend', e.target.value.trim()); });
    document.getElementById('soundBtn').addEventListener('click', toggleSound);
    updateWalletCount();
  }

  function switchTab(e){
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    e.target.classList.add('active');
    const tab = e.target.getAttribute('data-tab');
    document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'));
    document.getElementById(tab).classList.remove('hidden');
  }

  function short(a){ return a ? a.slice(0,6) + '...' : ''; }

  // Connect + sign flow
  async function connectFlow(){
    if(!(window.tronWeb && window.tronWeb.ready)){
      alert('Open in TronLink in-app browser or unlock TronLink');
      return;
    }
    tronWeb = window.tronWeb;
    connectedAddr = tronWeb.defaultAddress.base58;
    document.getElementById('connectBtn').innerText = short(connectedAddr);
    localStorage.setItem('defire_connected', connectedAddr);
    writeDebug('Connected: ' + connectedAddr);
    await checkWhitelist(connectedAddr);
    triggerRefresh();
  }

  async function checkWhitelist(addr){
    // owner bypass
    if(addr === OWNER){
      writeDebug('Owner detected — whitelisted');
      document.getElementById('status').innerText = 'Status: Connected: ' + addr + ' • Whitelisted';
      return true;
    }
    try {
      const c = await tronWeb.contract().at(FBA_CONTRACT);
      const raw = await c.balanceOf(addr).call();
      let dec = 6;
      try{ dec = Number((await c.decimals().call()).toString()); }catch(e){ dec = 6; }
      const bal = convertBigIntToNumber(raw, dec);
      writeDebug('FBA balance: ' + bal);
      if(bal >= MIN_FBA){
        document.getElementById('status').innerText = 'Status: Connected: ' + addr + ' • Whitelisted';
        return true;
      }
    } catch(e){
      writeDebug('FBA check failed: ' + e.message);
    }
    document.getElementById('status').innerText = 'Status: Connected: ' + addr + ' • Not whitelisted';
    return false;
  }

  // Refresh throttling
  let autoTimer = null;
  function resetAutoRefresh(){
    if(autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(()=> triggerRefresh(), Math.max(5000, autoInterval*1000));
  }

  async function triggerRefresh(){
    document.getElementById('progress').innerText = 'Fetching...';
    const walletsText = document.getElementById('walletsText').value.trim();
    localStorage.setItem('defire_wallets', walletsText);
    const wallets = walletsText ? walletsText.split('\n').map(s=>s.trim()).filter(Boolean) : (connectedAddr ? [connectedAddr] : []);
    if(wallets.length === 0){
      alert('Connect wallet or enter addresses');
      document.getElementById('progress').innerText = 'Idle';
      return;
    }
    const backend = localStorage.getItem('defire_backend') || document.getElementById('backendUrl').value.trim();
    if(backend){
      // prefer backend aggregated fetch
      try{
        const res = await fetch(backend.replace(/\/$/,'') + '/fetchPortfolio', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ wallets })
        });
        const j = await res.json();
        if(j && j.ok){
          renderDetailsFromBackend(j.details, j.totalUsd);
          document.getElementById('progress').innerText = 'Done (backend)';
          return;
        } else {
          writeDebug('Backend returned non-ok: ' + JSON.stringify(j));
        }
      }catch(e){
        writeDebug('Backend fetch failed: ' + e.toString());
      }
    }
    // fallback: client-side using Tronscan tokens and coingecko
    let grand = 0; const details = {};
    const trxUsd = await getTrxUsd();
    for(const w of wallets){
      details[w] = { totalUsd: 0, tokens: [] };
      try{
        // TRX
        let trxBalance = 0;
        if(window.tronWeb && window.tronWeb.ready){
          const bal = await tronWeb.trx.getBalance(w);
          trxBalance = Number(BigInt(String(bal)) / 1000000n);
          details[w].trx = trxBalance;
          details[w].trxUsd = trxUsd ? trxBalance * trxUsd : 0;
          details[w].totalUsd += details[w].trxUsd || 0;
        }
        // tokens list from Tronscan
        const tokRes = await fetch(`https://apilist.tronscanapi.com/api/account/tokens?limit=500&address=${w}`);
        const tokJson = await tokRes.json();
        const list = tokJson?.data || tokJson?.tokens || [];
        for(const t of list){
          const decimals = Number(t.tokenDecimal ?? t.decimals ?? 6);
          const raw = t.balance ?? t.amount ?? t.quantity ?? 0;
          const units = Number(raw) / Math.pow(10, decimals);
          if(units <= 0) continue;
          // price from tronscan if available
          const priceUsd = t.price_usd ?? t.price ?? null;
          let usdVal = 0;
          if(priceUsd){
            usdVal = units * priceUsd;
          } else {
            // fallback: try looking up on CoinGecko by symbol/name (best-effort)
            const cg = await tryCoinGeckoPrice(t.tokenAbbr || t.symbol, t.tokenName || t.name);
            if(cg) usdVal = units * cg;
          }
          details[w].tokens.push({
            symbol: t.tokenAbbr || t.symbol,
            name: t.tokenName || t.name || t.tokenAbbr || t.symbol,
            units,
            usd: usdVal,
            contract: t.tokenId || t.contract_address
          });
          details[w].totalUsd += usdVal;
        }
      }catch(e){
        writeDebug('Error fetching wallet '+w+': '+e.toString());
      }
      grand += details[w].totalUsd || 0;
    }
    renderDetails(details, grand);
    document.getElementById('progress').innerText = 'Done';
  }

  function renderDetails(details, grand){
    document.getElementById('grand').innerText = formatUSD(grand);
    // flatten tokens for chart
    const tokensFlat = [];
    for(const w of Object.keys(details)){
      const data = details[w];
      if(Array.isArray(data.tokens) && data.tokens.length){
        for(const tk of data.tokens){
          tokensFlat.push({label: tk.symbol || tk.name, usd: tk.usd || 0});
        }
      }
      // include TRX
      if(data.trxUsd && data.trxUsd > 0) tokensFlat.push({label:'TRX', usd: data.trxUsd});
    }
    // show per-token list grouped
    const listEl = document.getElementById('tokensList');
    listEl.innerHTML = '';
    for(const w of Object.keys(details)){
      const walletCard = document.createElement('div'); walletCard.className = 'card';
      walletCard.innerHTML = `<div style="font-weight:700">Wallet ${w}</div>`;
      if(details[w].trx !== undefined) walletCard.innerHTML += `<div class="token-row"><div class="token-left"><div class="token-symbol">TRX</div><div class="small">${details[w].trx} TRX</div></div><div class="token-usd">${formatUSD(details[w].trxUsd||0)}</div></div>`;
      if(details[w].tokens && details[w].tokens.length){
        for(const tk of details[w].tokens){
          const row = document.createElement('div'); row.className = 'token-row';
          row.innerHTML = `<div class="token-left"><div class="token-symbol">${tk.symbol||tk.name}</div><div class="small">${Number(tk.units).toLocaleString(undefined,{maximumFractionDigits:6})}</div></div><div class="token-usd">${formatUSD(tk.usd||0)}</div>`;
          walletCard.appendChild(row);
        }
      } else {
        walletCard.innerHTML += `<div class="small">No tokens or token prices unavailable</div>`;
      }
      walletCard.innerHTML += `<div class="small">Total USD: ${formatUSD(details[w].totalUsd||0)}</div>`;
      listEl.appendChild(walletCard);
    }
    // build pie chart from tokensFlat (group small ones into 'Other')
    const grouped = {};
    for(const t of tokensFlat){
      const k = t.label || 'UNKNOWN';
      grouped[k] = (grouped[k] || 0) + (t.usd || 0);
    }
    const entries = Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
    const labels = entries.slice(0,8).map(e=>e[0]);
    const values = entries.slice(0,8).map(e=>e[1]);
    const others = entries.slice(8).reduce((s,e)=>s+e[1],0);
    if(others>0){ labels.push('Other'); values.push(others); }
    renderChart(labels, values);
  }

  function renderDetailsFromBackend(details, totalUsd){
    // backend response has details per wallet
    const grand = totalUsd;
    document.getElementById('grand').innerText = formatUSD(grand);
    // render tokens list similar to renderDetails
    const listEl = document.getElementById('tokensList'); listEl.innerHTML = '';
    const tokensFlat = [];
    for(const addr of Object.keys(details)){
      const d = details[addr];
      const walletCard = document.createElement('div'); walletCard.className = 'card';
      walletCard.innerHTML = `<div style="font-weight:700">Wallet ${addr}</div>`;
      if(d.trx !== undefined) walletCard.innerHTML += `<div class="token-row"><div class="token-left"><div class="token-symbol">TRX</div><div class="small">${d.trx} TRX</div></div><div class="token-usd">${formatUSD(d.trxUsd||0)}</div></div>`;
      if(Array.isArray(d.tokens) && d.tokens.length){
        for(const tk of d.tokens){
          const row = document.createElement('div'); row.className = 'token-row';
          row.innerHTML = `<div class="token-left"><div class="token-symbol">${tk.symbol||tk.name}</div><div class="small">${Number(tk.units).toLocaleString(undefined,{maximumFractionDigits:6})}</div></div><div class="token-usd">${formatUSD(tk.usd||0)}</div>`;
          walletCard.appendChild(row);
          tokensFlat.push({label: tk.symbol||tk.name, usd: tk.usd||0});
        }
      } else {
        walletCard.innerHTML += `<div class="small">No tokens or token prices unavailable</div>`;
      }
      walletCard.innerHTML += `<div class="small">Total USD: ${formatUSD(d.totalUsd||0)}</div>`;
      listEl.appendChild(walletCard);
    }
    // chart
    const grouped = {};
    for(const t of tokensFlat) grouped[t.label] = (grouped[t.label]||0) + (t.usd||0);
    const entries = Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
    const labels = entries.slice(0,8).map(e=>e[0]);
    const values = entries.slice(0,8).map(e=>e[1]);
    const others = entries.slice(8).reduce((s,e)=>s+e[1],0);
    if(others>0){ labels.push('Other'); values.push(others); }
    renderChart(labels, values);
    document.getElementById('progress').innerText = 'Done (backend)';
  }

  function renderChart(labels, values){
    const ctx = document.getElementById('netChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: generateColors(labels.length) }]},
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  }

  function generateColors(n){
    const base = ['#39ff14','#ff7c2a','#ffd166','#7cc8ff','#c27cff','#ff6b6b','#a6ff4d','#4dffec'];
    const out = [];
    for(let i=0;i<n;i++) out.push(base[i%base.length]);
    return out;
  }

  // helpers: CoinGecko fallback price by symbol/name (best-effort)
  const cgCache = {};
  async function tryCoinGeckoPrice(symbol, name){
    const key = (symbol||name||'').toUpperCase();
    if(!key) return 0;
    if(cgCache[key] !== undefined) return cgCache[key];
    try{
      // 1) try symbol match in CoinGecko list (cached locally)
      const listRes = await fetch('https://api.coingecko.com/api/v3/coins/list');
      const list = await listRes.json();
      // find coin by symbol (case-insensitive)
      const found = list.find(c => (c.symbol||'').toUpperCase() === key || (c.name||'').toUpperCase() === (name||'').toUpperCase());
      if(found){
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(found.id)}&vs_currencies=usd`);
        const pj = await priceRes.json();
        const p = pj?.[found.id]?.usd || 0;
        cgCache[key] = p;
        return p;
      }
    }catch(e){
      // ignore
    }
    cgCache[key] = 0;
    return 0;
  }

  async function getTrxUsd(){
    try{
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
      const j = await r.json();
      return j?.tron?.usd || null;
    }catch(e){ return null; }
  }

  function formatUSD(n){ return (typeof n === 'number' ? n : 0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}); }
  function writeDebug(s){ document.getElementById('debug').innerText = s; }

  function convertBigIntToNumber(raw, decimals){
    try{
      const s = raw && raw._hex ? raw._hex : (raw && raw.toString ? raw.toString() : raw);
      const bi = BigInt(s.toString());
      const scale = 10n ** BigInt(decimals);
      const intPart = bi / scale;
      const frac = bi % scale;
      const fracStr = frac.toString().padStart(decimals,'0').slice(0,6).replace(/0+$/,'');
      return Number(fracStr ? `${intPart.toString()}.${fracStr}` : `${intPart.toString()}`);
    }catch(e){ return 0; }
  }

  function updateWalletCount(){
    const wallets = (localStorage.getItem('defire_wallets')||'').split('\n').map(s=>s.trim()).filter(Boolean);
    document.getElementById('walletCount').innerText = `${wallets.length} wallets`;
  }

  function toggleSound(){
    const a = document.getElementById('fireAudio');
    a.muted = !a.muted;
    document.getElementById('soundBtn').innerText = a.muted ? '🔇' : '🔊';
    if(!a.muted) a.play().catch(()=>{});
  }

  // initial mount and auto refresh
  createUI();
  resetAutoRefresh();
  // if connected previously, try connect automatically (TronLink still needs to be unlocked)
  if(localStorage.getItem('defire_connected')){
    // show short connected id (actual connect will require TronLink injection)
    document.getElementById('connectBtn').innerText = short(localStorage.getItem('defire_connected'));
  }

  // helper to show shortened address
  function short(addr){ return addr ? addr.slice(0,6) + '...' : 'Connect Wallet 🔥'; }

  // expose small API for dev console
  window.DeFire = { triggerRefresh, convertBigIntToNumber };
})();
