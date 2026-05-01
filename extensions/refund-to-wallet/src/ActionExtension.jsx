import "@shopify/ui-extensions/preact";
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const { close, data, extension } = shopify;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const orderId = data?.selected?.[0]?.id;
  const appUrl = extension?.appUrl || '';

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `query GetOrder($id: ID!) {
            order(id: $id) {
              id
              name
              totalPriceSet { shopMoney { amount currencyCode } }
              customer { id displayName email }
            }
          }`,
          variables: { id: orderId },
        }),
      });
      const json = await res.json();
      setOrder(json.data?.order);
      setLoading(false);
    })();
  }, [orderId]);

  const handleSubmit = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      console.log('App URL:', appUrl);
      console.log('Submitting refund:', { customerId: order?.customer?.id, amount, reason, orderId });

      const res = await fetch(`${appUrl}/api/refund-to-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: order?.customer?.id,
          amount: parseFloat(amount),
          reason: reason || `Refund for order ${order?.name}`,
          orderId,
        }),
      });

      console.log('Response status:', res.status);
      const json = await res.json();
      console.log('Response:', json);

      if (json.success) {
        setSuccess(true);
      } else {
        setError(json.error || 'Something went wrong.');
      }
    } catch (e) {
      console.error('Fetch error:', e);
      setError(`Network error: ${e.message}`);
    }

    setSubmitting(false);
  };

  return (
    <s-admin-action>
      <s-stack direction="block" gap="base">

        {loading && <s-text>Loading order details...</s-text>}

        {!loading && order && !success && (
          <>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="tight">
                <s-text type="strong">Order: {order.name}</s-text>
                <s-text>Customer: {order.customer?.displayName || 'Unknown'}</s-text>
                <s-text>Email: {order.customer?.email || '-'}</s-text>
                <s-text>Order Total: ₹{parseFloat(order.totalPriceSet?.shopMoney?.amount || 0).toFixed(2)}</s-text>
              </s-stack>
            </s-box>

            <s-text-field
              label="Refund Amount (₹)"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onInput={(e) => setAmount(e.target.value)}
            />

            <s-text-field
              label="Reason (optional)"
              placeholder={`Refund for order ${order?.name}`}
              value={reason}
              onInput={(e) => setReason(e.target.value)}
            />

            {error && (
              <s-box padding="tight" borderRadius="base">
                <s-text tone="critical">{error}</s-text>
              </s-box>
            )}
          </>
        )}

        {success && (
          <s-box padding="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">✅ Wallet credited successfully!</s-text>
              <s-text>₹{amount} has been added to {order?.customer?.displayName}'s wallet.</s-text>
            </s-stack>
          </s-box>
        )}

      </s-stack>

      {!success && (
        <s-button
          slot="primary-action"
          onClick={handleSubmit}
          disabled={submitting || loading}
        >
          {submitting ? 'Processing...' : 'Refund to Wallet'}
        </s-button>
      )}

      <s-button slot="secondary-actions" onClick={() => close()}>
        {success ? 'Done' : 'Cancel'}
      </s-button>
    </s-admin-action>
  );
}