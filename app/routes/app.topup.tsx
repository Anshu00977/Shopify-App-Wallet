import { type LoaderFunctionArgs, type ActionFunctionArgs, type HeadersFunction } from "react-router";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(`
    #graphql
    query getCustomers {
      customers(first: 50) {
        edges { node { id displayName email } }
      }
    }
  `);
    const data = await response.json();
    const customers = data.data?.customers?.edges?.map((e: any) => e.node) || [];
    return { customers };
}

export async function action({ request }: ActionFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();

    let customerId = formData.get("customerId") as string;
    customerId = customerId.replace("gid://shopify/customers/", "gid://shopify/Customer/");
    const amount = parseFloat(formData.get("amount") as string);

    if (!customerId || isNaN(amount) || amount <= 0) {
        return { error: "Invalid customer ID or amount." };
    }

    const productResponse = await admin.graphql(`
    #graphql
    query findTopUpProduct {
      products(first: 1, query: "title:'VaultWallet Top-Up'") {
        edges {
          node {
            id
            variants(first: 1) {
              edges { node { id } }
            }
          }
        }
      }
    }
  `);

    const productData = await productResponse.json();
    let variantId = productData.data?.products?.edges?.[0]?.node?.variants?.edges?.[0]?.node?.id;
    let productId = productData.data?.products?.edges?.[0]?.node?.id;

    if (!variantId) {
        const createProduct = await admin.graphql(`
      #graphql
      mutation createTopUpProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            variants(first: 1) {
              edges { node { id } }
            }
          }
        }
      }
    `, { variables: { input: { title: "VaultWallet Top-Up", status: "DRAFT" } } });

        const createData = await createProduct.json();
        productId = createData.data?.productCreate?.product?.id;
        variantId = createData.data?.productCreate?.product?.variants?.edges?.[0]?.node?.id;
    }

    if (!variantId) return { error: "Could not create top-up product." };

    await admin.graphql(`
    #graphql
    mutation updateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
      }
    }
  `, { variables: { productId, variants: [{ id: variantId, price: amount.toFixed(2) }] } });

    const draftOrderResponse = await admin.graphql(`
    #graphql
    mutation createDraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }
  `, {
        variables: {
            input: {
                lineItems: [{ variantId, quantity: 1 }],
                customerId,
                note: `VaultWallet top-up of ₹${amount}`,
                tags: ["vaultwallet-topup"],
            },
        },
    });

    const draftData = await draftOrderResponse.json();
    const invoiceUrl = draftData.data?.draftOrderCreate?.draftOrder?.invoiceUrl;
    const userErrors = draftData.data?.draftOrderCreate?.userErrors;

    if (userErrors?.length > 0) return { error: userErrors[0].message };
    if (!invoiceUrl) return { error: "Could not generate payment link." };

    const draftOrderId = draftData.data?.draftOrderCreate?.draftOrder?.id;
    let wallet = await db.wallet.findUnique({ where: { customerId } });
    if (!wallet) {
        wallet = await db.wallet.create({ data: { shop: session.shop, customerId, balance: 0 } });
    }

    await db.transaction.create({
        data: {
            walletId: wallet.id,
            type: "credit",
            amount,
            reason: "Wallet top-up via Shopify checkout",
            status: "pending",
            orderId: draftOrderId,
            invoiceUrl,
        },
    });

    return { success: true, invoiceUrl };
}

const WalletDecor = () => (
    <svg width="110" height="90" viewBox="0 0 110 90" fill="none">
        <ellipse cx="75" cy="55" rx="45" ry="38" fill="#e8f5e9" opacity="0.8" />
        <rect x="30" y="28" width="58" height="38" rx="8" fill="#2e7d32" opacity="0.15" />
        <rect x="36" y="34" width="58" height="38" rx="8" fill="#1b5e20" opacity="0.2" />
        <rect x="42" y="40" width="58" height="38" rx="8" fill="#004c3f" opacity="0.25" />
        <circle cx="88" cy="62" r="13" fill="#FFD700" opacity="0.85" />
        <text x="82" y="67" fill="white" fontSize="13" fontWeight="bold">₹</text>
        <circle cx="100" cy="30" r="5" fill="#FFD700" opacity="0.6" />
        <circle cx="108" cy="42" r="3" fill="#FFD700" opacity="0.4" />
        <text x="95" y="25" fill="#FFD700" fontSize="10" opacity="0.7">✦</text>
        <text x="28" y="32" fill="#FFD700" fontSize="8" opacity="0.5">✦</text>
    </svg>
);

export default function TopUpPage() {
    const { customers } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();

    const isLoading = fetcher.state === "submitting";
    const error = fetcher.data?.error;
    const invoiceUrl = fetcher.data?.invoiceUrl;

    return (
        <div style={pageWrapper}>
            <div style={card}>

                {/* Card Header */}
                <div style={cardHeader}>
                    <div style={cardHeaderLeft}>
                        <div style={iconBox}>
                            <i className="ph ph-wallet" style={{ fontSize: "26px", color: "white" }} />
                        </div>
                        <div>
                            <h2 style={cardTitle}>Add Money to Wallet</h2>
                            <p style={cardSubtitle}>Add funds to a customer wallet instantly and securely.</p>
                        </div>
                    </div>
                    <div style={decorBox}>
                        <WalletDecor />
                    </div>
                </div>

                <div style={cardBody}>
                    {error && <div style={alertError}>⚠️ &nbsp;{error}</div>}

                    {invoiceUrl ? (
                        <div style={successBox}>
                            <div style={successIcon}>
                                <i className="ph ph-check-circle" style={{ fontSize: "32px", color: "#2e7d32" }} />
                            </div>
                            <div>
                                <p style={successTitle}>Payment link generated!</p>
                                <p style={successSubtitle}>Share this link with your customer to complete the top-up.</p>
                            </div>
                            <a href={invoiceUrl} target="_blank" rel="noreferrer" style={payBtn}>
                                <i className="ph ph-arrow-square-out" style={{ fontSize: "16px" }} />
                                &nbsp; Pay Now
                            </a>
                        </div>
                    ) : (
                        <fetcher.Form method="post">
                            <div style={formGroup}>
                                <label style={label}>Select Customer</label>
                                <div style={inputRow}>
                                    <span style={inputIconBox}>
                                        <i className="ph ph-user" style={{ fontSize: "16px", color: "#888" }} />
                                    </span>
                                    <select name="customerId" style={selectField} required>
                                        <option value="">-- Select a customer --</option>
                                        {customers.map((c: any) => (
                                            <option key={c.id} value={c.id}>
                                                {c.displayName} ({c.email})
                                            </option>
                                        ))}
                                    </select>
                                    <span style={chevron}>▾</span>
                                </div>
                            </div>

                            <div style={formGroup}>
                                <label style={label}>Amount (₹)</label>
                                <div style={inputRow}>
                                    <span style={rupeeBox}>
                                        <i className="ph ph-currency-inr" style={{ fontSize: "16px", color: "#555" }} />
                                    </span>
                                    <input
                                        name="amount"
                                        type="number"
                                        min="1"
                                        step="1"
                                        style={inputField}
                                        placeholder="500"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                style={isLoading ? { ...submitBtn, opacity: 0.7 } : submitBtn}
                                disabled={isLoading}
                            >
                                <i className="ph ph-link" style={{ fontSize: "16px" }} />
                                <span>{isLoading ? "Generating..." : "Generate Payment Link"}</span>
                            </button>
                        </fetcher.Form>
                    )}
                </div>
            </div>
        </div>
    );
}

const pageWrapper: React.CSSProperties = {
    padding: "28px 32px",
    background: "#f0f2f8",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
};
const card: React.CSSProperties = {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid #e8eaed",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    overflow: "hidden",
    maxWidth: "780px",
    margin: "0 auto",
};
const cardHeader: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "28px 32px",
    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
    borderBottom: "1px solid #e8eaed",
};
const cardHeaderLeft: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "18px",
};
const iconBox: React.CSSProperties = {
    width: "62px", height: "62px", borderRadius: "16px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
};
const cardTitle: React.CSSProperties = {
    fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a",
};
const cardSubtitle: React.CSSProperties = {
    fontSize: "13px", color: "#666", margin: "4px 0 0",
};
const decorBox: React.CSSProperties = { flexShrink: 0 };
const cardBody: React.CSSProperties = { padding: "32px" };
const formGroup: React.CSSProperties = { marginBottom: "24px" };
const label: React.CSSProperties = {
    display: "block", marginBottom: "10px",
    fontWeight: 700, fontSize: "14px", color: "#1a1a1a",
};
const inputRow: React.CSSProperties = {
    display: "flex", alignItems: "center",
    border: "1.5px solid #e2e8f0", borderRadius: "12px",
    background: "#fff", overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
const inputIconBox: React.CSSProperties = {
    padding: "0 14px", display: "flex", alignItems: "center", flexShrink: 0,
};
const rupeeBox: React.CSSProperties = {
    padding: "14px 16px",
    background: "#f8fafc",
    borderRight: "1.5px solid #e2e8f0",
    display: "flex", alignItems: "center", flexShrink: 0,
};
const baseField: React.CSSProperties = {
    flex: 1, padding: "14px 16px", border: "none", outline: "none",
    fontSize: "15px", background: "transparent", color: "#1a1a1a",
};
const inputField: React.CSSProperties = { ...baseField };
const selectField: React.CSSProperties = {
    ...baseField, appearance: "none" as any, cursor: "pointer",
};
const chevron: React.CSSProperties = {
    paddingRight: "14px", color: "#aaa", fontSize: "13px", pointerEvents: "none",
};
const submitBtn: React.CSSProperties = {
    padding: "14px 32px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    color: "#fff", border: "none", borderRadius: "12px",
    fontSize: "15px", fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: "8px",
    boxShadow: "0 4px 14px rgba(6,95,70,0.3)",
};
const alertError: React.CSSProperties = {
    background: "#fff5f5", border: "1px solid #ffcdd2", color: "#c62828",
    padding: "12px 16px", borderRadius: "10px", marginBottom: "20px", fontSize: "14px",
};
const successBox: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "16px",
    background: "#f0fdf4", border: "1px solid #bbf7d0",
    borderRadius: "14px", padding: "20px 24px",
};
const successIcon: React.CSSProperties = { flexShrink: 0 };
const successTitle: React.CSSProperties = {
    fontWeight: 700, fontSize: "15px", color: "#1a1a1a", margin: 0,
};
const successSubtitle: React.CSSProperties = {
    fontSize: "13px", color: "#666", margin: "4px 0 0",
};
const payBtn: React.CSSProperties = {
    marginLeft: "auto", padding: "12px 24px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    color: "#fff", borderRadius: "10px", textDecoration: "none",
    fontWeight: 700, fontSize: "14px", flexShrink: 0,
    display: "inline-flex", alignItems: "center",
};

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};