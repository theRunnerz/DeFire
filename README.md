DeFire v5 - Frontend + Backend (Render-ready)
-----------------------------------------------

Structure:
- frontend/   (static site to deploy to GitHub Pages; update BACKEND URL in app_v5.js or via localStorage defire_backend)
- backend/    (Node/Express server to deploy on Render)

Quick deploy backend to Render:
1. Push the repo to GitHub under your account (theRunnerz/-calculator-).
2. In Render, create a new Web Service, connect the repo, choose the 'backend' folder as the root, and Render will auto-deploy.
3. After deployment, copy the backend URL (e.g., https://defire-backend.onrender.com) and set it in browser localStorage:
   - Open console and run: localStorage.setItem('defire_backend', 'https://defire-backend.onrender.com')

Quick deploy frontend to GitHub Pages:
1. Upload contents of frontend/ to the repo root (index.html, style.css, app_v5.js, favicon.png).
2. Enable GitHub Pages (Settings → Pages → branch: main, folder: / (root)).

Notes:
- This backend is read-only and uses public TRON APIs (TronGrid + Tronscan) and Coingecko for TRX price as fallback.
- WinkLink oracle integration is in the frontend/backend as a placeholder mapping (KNOWN_ORACLES). I can populate verified feed addresses next.
- For production signature verification, the backend currently uses tronWeb.trx.verifyMessage when available; we can tighten verification depending on signature format.
