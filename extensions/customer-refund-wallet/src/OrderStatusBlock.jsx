import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useEffect } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const base = 'https://scenario-letting-agents-cause.trycloudflare.com/refund-request';

  useEffect(() => {
    setTimeout(() => {
      const order = shopify?.order?.valueOf?.() || {};
      const buyerRaw = shopify?.buyerIdentity?.valueOf?.() || {};
      const shop = shopify?.shop?.myshopifyDomain ?? '';
      const cost = shopify?.cost?.valueOf?.() || {};

      const customerRaw = buyerRaw?.customer?.valueOf?.() || buyerRaw?.customer || {};

      const customerId = customerRaw?.id ?? '';
      const customerName = customerRaw?.fullName ?? '';
      const customerEmail = customerRaw?.email ?? '';
      const costJson = JSON.parse(JSON.stringify(cost));
      const orderTotal = costJson?.totalAmount?.amount ?? 0;

      console.log("orderTotal:", orderTotal);
      console.log("cost:", JSON.stringify(cost));

      const params = new URLSearchParams({
        shop,
        customerId,
        customerName,
        customerEmail,
        orderId: order?.id ?? '',
        orderName: order?.name ?? '',
        orderTotal: orderTotal.toString(),
      });

      const fullUrl = `${base}?${params.toString()}`;
      console.log("Full URL ready:", fullUrl);

      document.querySelectorAll('s-link').forEach(el => {
        el.setAttribute('href', fullUrl);
      });
    }, 500);
  }, []);

  return (
    <s-stack direction="block" gap="base">
      <s-banner>
        <s-text type="strong">💳 VaultWallet Refund</s-text>
        <s-text>Click below to request a refund</s-text>
      </s-banner>
      <s-link href={base} id="refund-link">
        Request Refund to Wallet
      </s-link>
    </s-stack>
  );
}