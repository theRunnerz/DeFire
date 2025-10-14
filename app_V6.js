// DeFire v6 frontend simplified bundle
(function(){
  const OWNER="TY691Xr2EWgKJmHfm7NWKMRJjojLmS2cma";
  const FBA="TNW5ABkp3v4jfeDo1vRVjxa3gtnoxP3DBN";
  const MIN_FBA=1000;
  let tronWeb=window.tronWeb||null;
  let connected=null; let autoTimer=null;

  function mount(){
    const root=document.getElementById('root');
    root.innerHTML=`<div class="app"><header class="topbar"><div class="brand">DeFire <span class="small">— Tron Portfolio Tracker</span></div><div class="controls"><button id="connectBtn" class="connect-btn glow">Connect Wallet 🔥 <span class="flame">🔥</span></button></div></header><main class="container"><div class="tabs"><button class="tab active" data-tab="net">🔥 Net Worth</button><button class="tab" data-tab="calc">🔥 Calculator</button><button class="tab" data-tab="settings">⚙️ Settings</button></div><section id="net" class="card panel"><h2>Grand Total</h2><div id="grand" class="grand">—</div><div id="status" class="small">Status: Not connected</div><div id="tokensArea"></div><canvas id="chart" style="max-height:260px"></canvas><div style="margin-top:10px"><button id="refreshBtn" class="connect-btn">Refresh</button> <span id="progress" class="pill">Idle</span></div></section><section id="calc" class="card panel hidden"><h2>Fire Calculator</h2><label>Yearly expenses ($)</label><input id="exp" type="number" /><label>Current savings ($)</label><input id="cur" type="number" /><label>Yearly savings ($)</label><input id="save" type="number" /><label>APY (%)</label><input id="apy" type="number" /><div style="margin-top:8px"><button id="calcBtn" class="connect-btn">Calculate FIRE</button></div><div id="calcResult" class="small"></div></section><section id="settings" class="card panel hidden"><h3>Settings</h3><label>Auto-refresh (sec)</label><input id="interval" type="number" value="30" /><label>Sound (muted on load)</label><br/><button id="soundToggle" class="connect-btn">Toggle Sound</button><div id="debug" class="debug">Debug: ready</div></section></main><footer class="footer">Made with ❤️ by FootballAlien$ — Neon green</footer></div>`;
    bind();
    tryAuto();
  }

  function bind(){
    document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', (e)=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); e.target.classList.add('active'); document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden')); document.getElementById(e.target.getAttribute('data-tab')).classList.remove('hidden'); }));
    document.getElementById('connectBtn').addEventListener('click', connect);
    document.getElementById('refreshBtn').addEventListener('click', fetchAll);
    document.getElementById('calcBtn').addEventListener('click', calc);
    document.getElementById('soundToggle').addEventListener('click', toggleSound);
    document.getElementById('interval').addEventListener('change', ()=>{ localStorage.setItem('defire_interval', document.getElementById('interval').value); resetAuto(); });
  }

  async function connect(){
    if(!(window.tronWeb && window.tronWeb.ready)){ alert('Open in TronLink in-app browser or unlock TronLink'); return; }
    tronWeb = window.tronWeb; connected = tronWeb.defaultAddress.base58;
    document.getElementById('connectBtn').classList.remove('glow'); document.getElementById('connectBtn').innerText = connected.slice(0,6)+'...';
    document.getElementById('status').innerText = 'Connected: '+connected; fadeInSound();
    fetchAll(); resetAuto();
  }

  function tryAuto(){ if(window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58){ document.getElementById('connectBtn').innerText = window.tronWeb.defaultAddress.base58.slice(0,6)+'...'; } }

  function fadeInSound(){ const s=document.getElementById('fireLoop'); if(!s) return; s.muted=false; s.volume=0; s.play().catch(()=>{}); let v=0; const iv=setInterval(()=>{ v+=0.05; s.volume=Math.min(0.35,v); if(v>=0.35) clearInterval(iv); },150); }

  function toggleSound(){ const s=document.getElementById('fireLoop'); if(s.muted||s.volume===0){ s.muted=false; s.play().catch(()=>{}); s.volume=0.3; } else { s.muted=true; s.pause&&s.pause(); } }

  let autoTimer=null;
  function resetAuto(){ if(autoTimer) clearInterval(autoTimer); const sec = Number(localStorage.getItem('defire_interval') || document.getElementById('interval').value || 30); autoTimer = setInterval(fetchAll, Math.max(5000, sec*1000)); }

  async function fetchAll(){
    document.getElementById('progress').innerText = 'Fetching...';
    const wallets = connected ? [connected] : [];
    if(wallets.length===0){ document.getElementById('progress').innerText='Idle'; return; }
    const trxUsd = await getTrxUsd(); let grand=0; const details={};
    for(const w of wallets){
      details[w]={tokens:[], totalUsd:0};
      try{
        // trx
        if(window.tronWeb){ const b = await tronWeb.trx.getBalance(w); const trx = Number(BigInt(String(b))/1000000n); details[w].trx = trx; details[w].trxUsd = trxUsd?trx*trxUsd:0; details[w].totalUsd += details[w].trxUsd; }
        // tokens
        try{
          const r = await fetch(`https://apilist.tronscanapi.com/api/account/tokens?limit=500&address=${w}`);
          const j = await r.json(); const list = j?.data||j?.tokens||[];
          for(const t of list){
            const dec = Number(t.tokenDecimal ?? t.decimals ?? 6); const raw = t.balance ?? t.amount ?? t.quantity ?? 0; const units = Number(raw)/Math.pow(10,dec); if(units<=0) continue;
            const price = t.price_usd ?? t.price ?? null; let usd=0; if(price) usd = units*price; else { const fb = await tryCoinGecko(t.tokenAbbr||t.symbol,t.tokenName||t.name); if(fb) usd = units*fb; }
            details[w].tokens.push({symbol:t.tokenAbbr||t.symbol, units, usd, contract:t.tokenId||t.contract_address}); details[w].totalUsd += usd;
          }
        }catch(e){ console.warn('token fetch err',e); }
      }catch(e){ console.warn('wallet err', e); }
      grand += details[w].totalUsd||0;
    }
    render(details, grand); document.getElementById('progress').innerText='Done';
  }

  function render(details, grand){
    document.getElementById('grand').innerText = formatUSD(grand);
    const area = document.getElementById('tokensArea'); area.innerHTML='';
    const flat=[];
    for(const w of Object.keys(details)){
      const d = details[w]; const card = document.createElement('div'); card.className='card'; card.innerHTML=`<div style="font-weight:700">Wallet ${w}</div>`;
      if(d.trx!==undefined) card.innerHTML += `<div class="token-card"><div class="token-left"><div class="token-logo">TRX</div><div class="small">${d.trx} TRX</div></div><div class="token-usd">${formatUSD(d.trxUsd||0)}</div></div>`;
      for(const tk of d.tokens){ const el=document.createElement('div'); el.className='token-card'; el.innerHTML=`<div class="token-left"><div class="token-logo">${(tk.symbol||'T').slice(0,2)}</div><div><div class="token-symbol">${tk.symbol}</div><div class="small">${Number(tk.units).toLocaleString(undefined,{maximumFractionDigits:6})}</div></div></div><div class="token-usd">${formatUSD(tk.usd||0)}</div>`; el.addEventListener('click', ()=> window.open('https://tronscan.org/#/token20/'+tk.contract)); card.appendChild(el); flat.push({label:tk.symbol, usd:tk.usd||0}); }
      card.innerHTML += `<div class="small">Total USD: ${formatUSD(d.totalUsd||0)}</div>`; area.appendChild(card);
    }
    const grouped={}; flat.forEach(t=> grouped[t.label]= (grouped[t.label]||0)+(t.usd||0)); const entries = Object.entries(grouped).sort((a,b)=>b[1]-a[1]); const labels = entries.slice(0,8).map(e=>e[0]); const values = entries.slice(0,8).map(e=>e[1]); const others = entries.slice(8).reduce((s,e)=>s+e[1],0); if(others>0){ labels.push('Other'); values.push(others); } renderChart(labels, values);
  }

  function renderChart(labels, values){ const ctx = document.getElementById('chart').getContext('2d'); if(window.__defire_chart) window.__defire_chart.destroy(); window.__defire_chart = new Chart(ctx,{type:'pie', data:{labels, datasets:[{data:values, backgroundColor:['#39ff14','#ff7c2a','#ffd166','#7cc8ff','#c27cff','#ff6b6b','#a6ff4d','#4dffec']}]}, options:{plugins:{legend:{position:'bottom'}}}}); }

  const cgCache={}; async function tryCoinGecko(sym,name){ const key=(sym||name||'').toUpperCase(); if(!key) return 0; if(cgCache[key]!==undefined) return cgCache[key]; try{ const listRes = await fetch('https://api.coingecko.com/api/v3/coins/list'); const list = await listRes.json(); const found = list.find(c => (c.symbol||'').toUpperCase()===key || (c.name||'').toUpperCase()===(name||'').toUpperCase()); if(found){ const pr = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(found.id)}&vs_currencies=usd`); const pj = await pr.json(); const p = pj?.[found.id]?.usd||0; cgCache[key]=p; return p; } }catch(e){ } cgCache[key]=0; return 0; }

  async function getTrxUsd(){ try{ const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd'); const j = await r.json(); return j?.tron?.usd||null; }catch(e){ return null; } }
  function formatUSD(n){ return (typeof n==='number'? n:0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}); }

  function calc(){ const expenses=Number(document.getElementById('exp').value||0); const current=Number(document.getElementById('cur').value||0); const yearly=Number(document.getElementById('save').value||0); const apy=Number(document.getElementById('apy').value||0)/100; if(!Number.isFinite(expenses)||!Number.isFinite(current)||!Number.isFinite(yearly)||!Number.isFinite(apy)){ document.getElementById('calcResult').innerText='Please enter valid numbers'; return; } const target=expenses*25; let bal=current; let years=0; while(bal<target && years<100){ bal = bal*(1+apy)+yearly; years++; } document.getElementById('calcResult').innerText = years>=100 ? 'FIRE not reachable within 100 years' : `You can retire in ${years} years (projected balance: ${formatUSD(bal)})`; }

  document.addEventListener('DOMContentLoaded', mount);
})();
