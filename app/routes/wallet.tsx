import { type LoaderFunctionArgs } from "react-router";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("customerId") || "";
  const shop = url.searchParams.get("shop") || "";

  const customerId = rawId.startsWith("gid://")
    ? rawId
    : rawId
      ? `gid://shopify/Customer/${rawId}`
      : "";

  let balance = 0;
  if (customerId) {
    const wallet = await db.wallet.findUnique({ where: { customerId } });
    balance = wallet?.balance ?? 0;
  }

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>My Wallet</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 480px; margin: 40px auto; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .balance-box { background: #f0fdf4; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .balance-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .balance-amount { font-size: 36px; font-weight: 700; color: #065f46; }
    .section-title { font-size: 14px; font-weight: 700; color: #374151; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
    .input-group { margin-bottom: 16px; }
    .input-group label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 500; }
    .input-group input { width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 16px; outline: none; }
    .input-group input:focus { border-color: #065f46; }
    .btn { width: 100%; padding: 14px; background: #065f46; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; margin-bottom: 8px; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-outline { width: 100%; padding: 14px; background: white; color: #065f46; border: 2px solid #065f46; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .coupon-box { background: #f0fdf4; border: 2px dashed #065f46; border-radius: 12px; padding: 20px; text-align: center; margin-top: 20px; }
    .coupon-code { font-size: 24px; font-weight: 700; color: #065f46; letter-spacing: 2px; margin: 8px 0; }
    .copy-btn { background: none; border: 1px solid #065f46; color: #065f46; padding: 6px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 8px; }
    .error { color: #dc2626; font-size: 13px; margin-top: 8px; }
    .note { font-size: 12px; color: #9ca3af; margin-top: 8px; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 24px 0; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; }
    .tab { flex: 1; padding: 10px; border: 2px solid #e5e7eb; background: white; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; color: #6b7280; }
    .tab.active { border-color: #065f46; color: #065f46; background: #f0fdf4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <span style="font-size:28px">&#x1F4B3;</span>
        <h1>My Wallet</h1>
      </div>

      <div class="balance-box">
        <div class="balance-label">Available Balance</div>
        <div class="balance-amount" id="balance-display">&#8377;${balance.toFixed(2)}</div>
      </div>

      <div class="tabs">
        <button class="tab active" id="tab-redeem" onclick="switchTab('redeem')">Redeem Balance</button>
        <button class="tab" id="tab-recharge" onclick="switchTab('recharge')">Recharge Wallet</button>
      </div>

      <div id="panel-redeem">
        <div id="redeem-content"></div>
      </div>

      <div id="panel-recharge" style="display:none">
        <div class="input-group">
          <label>Amount to add (&#8377;)</label>
          <input type="number" id="recharge-amount" placeholder="Enter amount" min="1" />
        </div>
        <button class="btn" id="recharge-btn" onclick="rechargeWallet()">Recharge Wallet</button>
        <div id="recharge-error" class="error"></div>
      </div>

      <div id="content" style="display:none"></div>
    </div>
  </div>

  <script>
    const customerId = '${customerId}';
    const shop = '${shop}';
    let walletBalance = ${balance};

    function switchTab(tab) {
      document.getElementById('tab-redeem').classList.toggle('active', tab === 'redeem');
      document.getElementById('tab-recharge').classList.toggle('active', tab === 'recharge');
      document.getElementById('panel-redeem').style.display = tab === 'redeem' ? 'block' : 'none';
      document.getElementById('panel-recharge').style.display = tab === 'recharge' ? 'block' : 'none';
    }

    function renderRedeem() {
      document.getElementById('redeem-content').innerHTML =
        '<div class="input-group">' +
          '<label>Amount to redeem (&#8377;)</label>' +
          '<input type="number" id="amount-input" placeholder="Max &#8377;' + walletBalance.toFixed(2) + '" max="' + walletBalance + '" min="1" />' +
        '</div>' +
        '<button class="btn" id="gen-btn" onclick="generateCoupon()">Generate Coupon Code</button>' +
        '<div id="error" class="error"></div>' +
        '<div id="coupon-result" style="display:none" class="coupon-box">' +
          '<div style="font-size:13px;color:#6b7280">Your coupon code</div>' +
          '<div class="coupon-code" id="coupon-code"></div>' +
          '<div class="note">Valid for 24 hours. Apply at checkout.</div>' +
          '<button class="copy-btn" onclick="copyCoupon()">Copy Code</button>' +
        '</div>';
    }

    async function generateCoupon() {
      const amount = parseFloat(document.getElementById('amount-input').value);
      const errorEl = document.getElementById('error');
      if (!amount || amount <= 0) { errorEl.textContent = 'Enter a valid amount'; return; }
      if (amount > walletBalance) { errorEl.textContent = 'Amount exceeds wallet balance'; return; }
      errorEl.textContent = '';
      const btn = document.getElementById('gen-btn');
      btn.textContent = 'Generating...';
      btn.disabled = true;
      const res = await fetch('/apps/vaultwallet/api/apply-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, shop, amount })
      });
      const data = await res.json();
      if (data.code) {
        document.getElementById('coupon-code').textContent = data.code;
        document.getElementById('coupon-result').style.display = 'block';
        walletBalance -= amount;
        document.getElementById('balance-display').textContent = '₹' + walletBalance.toFixed(2);
        btn.textContent = 'Generate Another';
        btn.disabled = false;
      } else {
        errorEl.textContent = data.error || 'Failed to generate coupon';
        btn.textContent = 'Generate Coupon Code';
        btn.disabled = false;
      }
    }

    function copyCoupon() {
      const code = document.getElementById('coupon-code').textContent;
      navigator.clipboard.writeText(code).then(function() {
        document.querySelector('.copy-btn').textContent = 'Copied!';
        setTimeout(function() { document.querySelector('.copy-btn').textContent = 'Copy Code'; }, 2000);
      });
    }

    async function rechargeWallet() {
      const amount = parseFloat(document.getElementById('recharge-amount').value);
      const errorEl = document.getElementById('recharge-error');
      if (!amount || amount <= 0) { errorEl.textContent = 'Enter a valid amount'; return; }
      errorEl.textContent = '';
      const btn = document.getElementById('recharge-btn');
      btn.textContent = 'Processing...';
      btn.disabled = true;
      const res = await fetch('/apps/vaultwallet/api/topup-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, shop, amount })
      });
      const data = await res.json();
      if (data.invoiceUrl) {
        window.location.href = data.invoiceUrl;
      } else {
        errorEl.textContent = data.error || 'Failed to create recharge order';
        btn.textContent = 'Recharge Wallet';
        btn.disabled = false;
      }
    }

    if (!customerId) {
      document.getElementById('panel-redeem').innerHTML = '<p style="color:#6b7280">No customer found.</p>';
      document.querySelector('.tabs').style.display = 'none';
    } else {
      renderRedeem();
    }
  </script>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }
  );
}