import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";

const SHOP = 'wallet-payments-tpa8zlgj.myshopify.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    setTimeout(() => {
      try {
        const account = shopify?.authenticatedAccount?.valueOf?.() || shopify?.authenticatedAccount || {};
        const accountJson = JSON.parse(JSON.stringify(account));
        console.log('accountJson:', JSON.stringify(accountJson));
        const id = accountJson?.customer?.id ?? '';
        console.log('customerId:', id);
        setCustomerId(id);
      } catch (e) {
        console.log('error:', e);
      }
    }, 500);
  }, []);

  function handleClick() {
    const walletUrl = `https://${SHOP}/apps/vaultwallet/wallet?customerId=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(SHOP)}`;
    console.log('navigating to:', walletUrl);
    shopify.navigation.navigate(walletUrl);
  }

  return (
    <s-section heading="My Wallet">
      <s-stack gap="base">
        <s-text>View your wallet balance and generate discount codes.</s-text>
        <s-button onClick={handleClick}>Open My Wallet</s-button>
      </s-stack>
    </s-section>
  );
}