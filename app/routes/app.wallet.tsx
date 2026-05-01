import { type LoaderFunctionArgs, type ActionFunctionArgs, type HeadersFunction } from "react-router";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);
    const wallets = await db.wallet.findMany({
        where: { shop: session.shop },
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 5 } },
        orderBy: { createdAt: "desc" },
    });
    const customerResponse = await admin.graphql(`
    #graphql
    query getCustomers {
      customers(first: 50) {
        edges { node { id displayName email } }
      }
    }
  `);
    const customerData = await customerResponse.json();
    const customers = customerData.data?.customers?.edges?.map((e: any) => e.node) || [];
    const customerMap: Record<string, { displayName: string; email: string }> = {};
    customers.forEach((c: any) => { customerMap[c.id] = { displayName: c.displayName, email: c.email }; });
    return { wallets, customers, customerMap };
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const customerId = formData.get("customerId") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const reason = formData.get("reason") as string;
    if (!customerId || isNaN(amount) || amount <= 0) return { error: "Invalid customer or amount." };
    let wallet = await db.wallet.findUnique({ where: { customerId } });
    if (!wallet) wallet = await db.wallet.create({ data: { shop: session.shop, customerId, balance: 0 } });
    await db.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await db.transaction.create({ data: { walletId: wallet.id, type: "credit", amount, reason } });
    return { success: true };
}

const MoneyDecor = () => (
    <svg width="90" height="75" viewBox="0 0 90 75" fill="none" opacity="0.12">
        <rect x="5" y="15" width="55" height="35" rx="6" fill="#008060" />
        <rect x="10" y="20" width="55" height="35" rx="6" fill="#008060" />
        <rect x="15" y="25" width="55" height="35" rx="6" fill="#065f46" />
        <circle cx="42" cy="42" r="10" fill="white" opacity="0.3" />
        <circle cx="72" cy="12" r="8" fill="#FFD700" opacity="0.7" />
        <circle cx="78" cy="6" r="4" fill="#FFD700" opacity="0.5" />
    </svg>
);

const CardSVG = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="3" stroke="white" strokeWidth="2" />
        <path d="M2 10h20" stroke="white" strokeWidth="2" />
        <rect x="5" y="14" width="4" height="2" rx="1" fill="white" />
    </svg>
);

const ShieldSVG = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6L12 2z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.15)" />
        <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export default function WalletPage() {
    const { wallets, customers, customerMap } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const isLoading = fetcher.state === "submitting";
    const error = fetcher.data?.error;
    const success = fetcher.data?.success;
    const avatarColors = ["#065f46", "#1e40af", "#6b21a8", "#991b1b", "#c2410c", "#0e7490"];

    return (
        <>
            {/* Load Phosphor Icons */}
            <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />

            <div style={pageWrapper}>

                {/* Issue Credit Card */}
                <div style={card}>
                    <div style={cardTop}>
                        <div style={cardTopLeft}>
                            <div style={iconBox}>
                                <i className="ph ph-wallet" style={{ fontSize: "24px", color: "white" }} />
                            </div>
                            <div>
                                <h2 style={cardTitle}>Issue Credit</h2>
                                <p style={cardSubtitle}>Manually add credit to a customer wallet.</p>
                            </div>
                        </div>
                        <div><MoneyDecor /></div>
                    </div>

                    {error && <div style={alertError}>⚠️ &nbsp;{error}</div>}
                    {success && <div style={alertSuccess}>✅ &nbsp;Credit issued successfully!</div>}

                    <fetcher.Form method="post">
                        <div style={formGrid}>
                            <div style={formGroup}>
                                <label style={label}>Select Customer</label>
                                <div style={inputRow}>
                                    <span style={inputIconBox}>
                                        <i className="ph ph-user" style={{ fontSize: "16px", color: "#888" }} />
                                    </span>
                                    <select name="customerId" style={selectField} required>
                                        <option value="">— Select a customer —</option>
                                        {customers.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.displayName} ({c.email})</option>
                                        ))}
                                    </select>
                                    <span style={chevron}>▾</span>
                                </div>
                            </div>
                            <div style={formGroup}>
                                <label style={label}>Amount (₹)</label>
                                <div style={inputRow}>
                                    <span style={{ ...inputIconBox, borderRight: "1.5px solid #e8eaed", paddingRight: "10px" }}>
                                        <i className="ph ph-currency-inr" style={{ fontSize: "16px", color: "#888" }} />
                                    </span>
                                    <input name="amount" type="number" min="0.01" step="0.01" style={inputField} placeholder="0.00" required />
                                </div>
                            </div>
                        </div>
                        <div style={formGroup}>
                            <label style={label}>Reason</label>
                            <div style={inputRow}>
                                <span style={inputIconBox}>
                                    <i className="ph ph-note-pencil" style={{ fontSize: "16px", color: "#888" }} />
                                </span>
                                <input name="reason" style={inputField} placeholder="e.g. Refund for order #1234" />
                            </div>
                        </div>
                        <button type="submit" style={isLoading ? { ...submitBtn, opacity: 0.7 } : submitBtn} disabled={isLoading}>
                            <i className="ph ph-sparkle" style={{ fontSize: "16px" }} />
                            <span>{isLoading ? "Issuing..." : "Issue Credit"}</span>
                        </button>
                    </fetcher.Form>
                </div>

                {/* Wallets Table Card */}
                <div style={card}>
                    <div style={cardTop}>
                        <div style={cardTopLeft}>
                            <div style={{ ...iconBox, background: "linear-gradient(135deg, #0f3d2e, #14532d)" }}>
                                <ShieldSVG />
                            </div>
                            <div>
                                <h2 style={cardTitle}>All Customer Wallets</h2>
                                <p style={cardSubtitle}>{wallets.length} wallet{wallets.length !== 1 ? "s" : ""} found</p>
                            </div>
                        </div>
                        <div><MoneyDecor /></div>
                    </div>

                    {wallets.length === 0 ? (
                        <div style={emptyState}>
                            <div style={{ fontSize: "48px" }}>🪙</div>
                            <p style={{ color: "#aaa", marginTop: "12px" }}>No wallets yet.</p>
                        </div>
                    ) : (
                        <table style={table}>
                            <thead>
                                <tr>
                                    <th style={th}>
                                        <span style={thInner}>
                                            <i className="ph ph-user" style={{ fontSize: "14px" }} /> CUSTOMER
                                        </span>
                                    </th>
                                    <th style={th}>
                                        <span style={thInner}>
                                            <i className="ph ph-envelope" style={{ fontSize: "14px" }} /> EMAIL
                                        </span>
                                    </th>
                                    <th style={th}>
                                        <span style={thInner}>
                                            <i className="ph ph-wallet" style={{ fontSize: "14px" }} /> BALANCE
                                        </span>
                                    </th>
                                    <th style={th}>
                                        <span style={thInner}>
                                            <i className="ph ph-calendar" style={{ fontSize: "14px" }} /> CREATED
                                        </span>
                                    </th>
                                    <th style={th}>
                                        <span style={thInner}>
                                            <i className="ph ph-check-circle" style={{ fontSize: "14px" }} /> STATUS
                                        </span>
                                    </th>
                                    <th style={th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {wallets.map((w) => {
                                    const customer = customerMap[w.customerId];
                                    const initials = customer?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "?";
                                    const color = avatarColors[w.id % avatarColors.length];
                                    return (
                                        <tr
                                            key={w.id}
                                            style={tableRow}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                        >
                                            <td style={td}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                    <div style={{ ...avatar, background: color }}>{initials}</div>
                                                    <span style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>
                                                        {customer?.displayName || "Unknown"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={td}><span style={{ color: "#666", fontSize: "13px" }}>{customer?.email || "-"}</span></td>
                                            <td style={td}><span style={balanceTxt}>₹{w.balance.toFixed(2)}</span></td>
                                            <td style={td}><span style={{ color: "#999", fontSize: "13px" }}>{new Date(w.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></td>
                                            <td style={td}>
                                                <span style={w.balance > 0 ? activePill : emptyPill}>
                                                    <span style={{ fontSize: "8px", marginRight: "5px" }}>●</span>
                                                    {w.balance > 0 ? "Active" : "Empty"}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <button style={dotMenu}>⋮</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    );
}

const pageWrapper: React.CSSProperties = {
    padding: "28px 32px", background: "#f0f2f8", minHeight: "100vh",
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
};
const card: React.CSSProperties = {
    background: "#ffffff", borderRadius: "20px", border: "1px solid #e8eaed",
    padding: "32px 36px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    marginBottom: "24px", overflow: "hidden", position: "relative",
};
const cardTop: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "28px", paddingBottom: "24px", borderBottom: "1px solid #f0f0f0",
};
const cardTopLeft: React.CSSProperties = { display: "flex", alignItems: "center", gap: "18px" };
const iconBox: React.CSSProperties = {
    width: "58px", height: "58px", borderRadius: "16px",
    background: "linear-gradient(135deg, #0f3d2e, #14532d)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
};
const cardTitle: React.CSSProperties = { fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a" };
const cardSubtitle: React.CSSProperties = { fontSize: "13px", color: "#999", margin: "4px 0 0" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" };
const formGroup: React.CSSProperties = { marginBottom: "20px" };
const label: React.CSSProperties = { display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "13px", color: "#555" };
const inputRow: React.CSSProperties = {
    display: "flex", alignItems: "center",
    border: "1.5px solid #e8eaed", borderRadius: "12px",
    background: "#fff", overflow: "hidden",
};
const inputIconBox: React.CSSProperties = { padding: "0 12px", display: "flex", alignItems: "center", flexShrink: 0 };
const baseField: React.CSSProperties = {
    flex: 1, padding: "13px 14px", border: "none", outline: "none",
    fontSize: "14px", background: "transparent", color: "#1a1a1a",
};
const inputField: React.CSSProperties = { ...baseField };
const selectField: React.CSSProperties = { ...baseField, appearance: "none" as any, cursor: "pointer" };
const chevron: React.CSSProperties = { paddingRight: "12px", color: "#aaa", fontSize: "12px", pointerEvents: "none" };
const submitBtn: React.CSSProperties = {
    padding: "13px 30px", background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    color: "#fff", border: "none", borderRadius: "12px",
    fontSize: "14px", fontWeight: 700, cursor: "pointer",
    letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: "6px",
};
const alertError: React.CSSProperties = {
    background: "#fff5f5", border: "1px solid #ffcdd2", color: "#c62828",
    padding: "12px 16px", borderRadius: "10px", marginBottom: "20px", fontSize: "14px",
};
const alertSuccess: React.CSSProperties = {
    background: "#f0fff4", border: "1px solid #c8e6c9", color: "#2e7d32",
    padding: "12px 16px", borderRadius: "10px", marginBottom: "20px", fontSize: "14px",
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #f0f0f0" };
const thInner: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "6px",
    fontSize: "11px", fontWeight: 700, color: "#aaa", letterSpacing: "0.6px",
};
const td: React.CSSProperties = { padding: "16px", borderBottom: "1px solid #f8f8f8" };
const tableRow: React.CSSProperties = { transition: "all 0.2s ease" };
const avatar: React.CSSProperties = {
    width: "38px", height: "38px", borderRadius: "50%",
    color: "#fff", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0,
};
const balanceTxt: React.CSSProperties = { fontWeight: 700, color: "#065f46", fontSize: "15px" };
const activePill: React.CSSProperties = {
    background: "#dcfce7", color: "#166534",
    padding: "5px 12px", borderRadius: "20px", fontSize: "12px",
    fontWeight: 600, display: "inline-flex", alignItems: "center",
};
const emptyPill: React.CSSProperties = {
    background: "#f5f5f5", color: "#999",
    padding: "5px 12px", borderRadius: "20px", fontSize: "12px",
    fontWeight: 600, display: "inline-flex", alignItems: "center",
};
const dotMenu: React.CSSProperties = {
    background: "none", border: "none", fontSize: "20px",
    cursor: "pointer", color: "#bbb", padding: "4px 8px", borderRadius: "6px",
};
const emptyState: React.CSSProperties = { textAlign: "center", padding: "48px 0" };

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};