import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const base = 'https://triple-nightlife-showcase-societies.trycloudflare.com';

  useEffect(() => {
    setTimeout(async () => {
      try {
        const buyerRaw = shopify?.buyerIdentity?.valueOf?.() || {};
        const customerRaw = buyerRaw?.customer?.valueOf?.() || buyerRaw?.customer || {};
        const customerId = customerRaw?.id ?? '';
        const shop = shopify?.shop?.myshopifyDomain ?? '';

        console.log("customerId:", customerId);

        if (!customerId) {
          setLoading(false);
          return;
        }

        const res = await fetch(`${base}/api/wallet-balance?customerId=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shop)}`);
        const json = await res.json();
        console.log("Balance response:", JSON.stringify(json));
        setBalance(json.balance ?? 0);
      } catch (e) {
        console.error("Error:", e);
        setBalance(0);
      }
      setLoading(false);
    }, 500);
  }, []);

  return (
    <s-stack direction="block" gap="base">
      <s-banner>
        <s-text type="strong">💳 VaultWallet Balance</s-text>
        {loading ? (
          <s-text>Loading your wallet balance...</s-text>
        ) : (
          <s-text type="strong">₹{(balance || 0).toFixed(2)}</s-text>
        )}
      </s-banner>
    </s-stack>
  );
}