
// app_v5.js - Frontend for DeFire v5
// Connects TronLink, signs a challenge, then calls backend to verify and fetch prices/portfolio.
// Backend assumed at BACKEND_URL (replace with deployed Render URL or local localhost:8899)

const BACKEND_URL = localStorage.getItem('defire_backend') || 'https://your-backend.example.com'; // update after deploy

const OWNER_WALLET = "TY691Xr2EWgKJmHfm7NWKMRJjojLmS2cma";
const FBA_CONTRACT = "TNW5ABkp3v4jfeDo1vRVjxa3gtnoxP3DBN";
let tronWeb = window.tronWeb || null;
let connectedAddr = "";

function $(sel){ return document.querySelector(sel); }
function create(tag, attrs={}){ const el = document.createElement(tag); Object.assign(el, attrs); return el; }

function initUI(){
  const app = $('#app');
  app.innerHTML = `
    <div class="header">
      <div><h1>🔥 DeFire v5</h1><div class="small">TRON • DeFi • Net Worth</div></div>
      <div><button id="connectBtn">Connect & Sign</button></div>
    </div>
    <div class="card" id="mainCard">
      <h2>Portfolio</h2>
      <div class="row"><label>Connected</label><div class="pill" id="connected">Not connected</div></div>
      <div class="row"><label>Backend</label><div class="pill" id="backend">Not set</div></div>
      <div class="row"><label>Wallets (one per line)</label><textarea id="walletsText" rows="4"></textarea></div>
      <div class="row"><button id="fetchBtn">Fetch Net Worth</button><div id="status" class="pill">Idle</div></div>
      <div class="total" id="grand">Grand Total: —</div>
      <pre id="debug" class="debug"></pre>
    </div>
  `;
  document.getElementById('connectBtn').addEventListener('click', connectAndSign);
  document.getElementById('fetchBtn').addEventListener('click', fetchNetworth);
  const be = localStorage.getItem('defire_backend') || '';
  $('#backend').innerText = be || 'Not configured';
}

async function connectAndSign(){
  if(!window.tronWeb || !window.tronWeb.ready){
    alert('Please open in TronLink in-app browser or unlock TronLink.');
    return;
  }
  tronWeb = window.tronWeb;
  connectedAddr = tronWeb.defaultAddress.base58 || '';
  $('#connected').innerText = connectedAddr;
  // sign challenge locally then send to backend verify endpoint
  const message = `DeFire login:${connectedAddr}@${Date.now()}`;
  try{
    let sigObj = null;
    if(typeof tronWeb.trx.signMessageV2 === 'function'){
      const sig = await tronWeb.trx.signMessageV2(message);
      sigObj = { message, signature: sig };
    } else if(typeof tronWeb.trx.sign === 'function'){
      const encoder = new TextEncoder();
      const bytes = encoder.encode(message);
      const hex = '0x' + Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
      const signed = await tronWeb.trx.sign(hex);
      sigObj = { message, signature: signed };
    }
    if(sigObj){
      localStorage.setItem('defire_sig', JSON.stringify(sigObj));
      // send to backend verify
      const backend = localStorage.getItem('defire_backend') || '';
      if(!backend){ alert('Set backend URL in localStorage as defire_backend'); return; }
      const res = await fetch(backend + '/verifySignature', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ address: connectedAddr, message: sigObj.message, signature: sigObj.signature })
      });
      const j = await res.json();
      if(j && j.ok){
        $('#status').innerText = 'Verified by backend';
      } else {
        $('#status').innerText = 'Backend verification failed';
      }
    }
  }catch(e){
    console.error(e);
    alert('Signing/verification error: ' + e.message);
  }
}

async function fetchNetworth(){
  const backend = localStorage.getItem('defire_backend') || '';
  if(!backend){ alert('Set backend URL in localStorage as defire_backend'); return; }
  const payload = { wallets: [] };
  const text = $('#walletsText').value || '';
  const wallets = text.split('\n').map(s=>s.trim()).filter(Boolean);
  if(wallets.length) payload.wallets = wallets;
  else {
    if(!window.tronWeb || !window.tronWeb.ready){ alert('Connect wallet or enter wallets'); return; }
    payload.wallets = [tronWeb.defaultAddress.base58];
  }
  $('#status').innerText = 'Fetching...';
  $('#debug').innerText = 'Requesting backend...';
  try{
    const res = await fetch(backend + '/fetchPortfolio', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await res.json();
    $('#debug').innerText = JSON.stringify(j, null, 2);
    if(j && j.totalUsd !== undefined){
      $('#grand').innerText = 'Grand Total: ' + formatUSD(j.totalUsd);
      $('#status').innerText = 'Done';
    } else {
      $('#status').innerText = 'No data';
    }
  }catch(e){
    console.error(e);
    $('#status').innerText = 'Error';
    $('#debug').innerText = e.toString();
  }
}

function formatUSD(n){ return (typeof n==='number'?n:0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}); }

initUI();
