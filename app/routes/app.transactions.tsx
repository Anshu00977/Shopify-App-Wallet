import { type LoaderFunctionArgs, type ActionFunctionArgs, type HeadersFunction } from "react-router";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);

    const transactions = await db.transaction.findMany({
        where: { wallet: { shop: session.shop } },
        include: { wallet: true },
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

    return { transactions, customerMap };
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const transactionId = parseInt(formData.get("transactionId") as string);

    const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
        include: { wallet: true },
    });

    if (!transaction || transaction.wallet.shop !== session.shop) {
        return { error: "Transaction not found." };
    }

    await db.transaction.update({ where: { id: transactionId }, data: { status: "completed" } });
    await db.wallet.update({ where: { id: transaction.walletId }, data: { balance: { increment: transaction.amount } } });

    return { success: true };
}

export default function TransactionsPage() {
    const { transactions, customerMap } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();

    const avatarColors = ["#065f46", "#1e40af", "#6b21a8", "#991b1b", "#c2410c", "#0e7490"];

    return (
        <div style={pageWrapper}>
            <div style={card}>

                {/* Card Header */}
                <div style={cardHeader}>
                    <div style={iconBox}>
                        <i className="ph ph-receipt" style={{ fontSize: "22px", color: "white" }} />
                    </div>
                    <h2 style={cardTitle}>All Transactions</h2>
                </div>

                {transactions.length === 0 ? (
                    <div style={emptyState}>
                        <i className="ph ph-receipt" style={{ fontSize: "48px", color: "#ccc" }} />
                        <p style={{ color: "#aaa", marginTop: "12px" }}>No transactions found yet.</p>
                    </div>
                ) : (
                    <table style={table}>
                        <thead>
                            <tr style={theadRow}>
                                <th style={th}>#</th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-user" style={{ fontSize: "13px" }} /> CUSTOMER
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-envelope" style={{ fontSize: "13px" }} /> EMAIL
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-swap" style={{ fontSize: "13px" }} /> TYPE
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-currency-inr" style={{ fontSize: "13px" }} /> AMOUNT
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-chat-text" style={{ fontSize: "13px" }} /> REASON
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-check-circle" style={{ fontSize: "13px" }} /> STATUS
                                    </span>
                                </th>
                                <th style={th}>
                                    <span style={thInner}>
                                        <i className="ph ph-calendar" style={{ fontSize: "13px" }} /> DATE
                                    </span>
                                </th>
                                <th style={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((t, index) => {
                                const customer = customerMap[t.wallet.customerId];
                                const initials = customer?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "?";
                                const color = avatarColors[(t.id) % avatarColors.length];
                                return (
                                    <tr
                                        key={t.id}
                                        style={tableRow}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td style={{ ...td, color: "#aaa", fontWeight: 600 }}>{index + 1}</td>
                                        <td style={td}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                <div style={{ ...avatar, background: color }}>{initials}</div>
                                                <span style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>
                                                    {customer?.displayName || t.wallet.customerId}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={td}>
                                            <span style={{ color: "#666", fontSize: "13px" }}>{customer?.email || "-"}</span>
                                        </td>
                                        <td style={td}>
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "60px" }}>
                                                <span style={{ color: t.type === "credit" ? "#065f46" : "#dc2626", fontSize: "16px" }}>
                                                    {t.type === "credit" ? "↑" : "↓"}
                                                </span>
                                                <span style={{ color: t.type === "credit" ? "#065f46" : "#dc2626", fontWeight: 700, fontSize: "12px" }}>
                                                    {t.type === "credit" ? "Credit" : "Debit"}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={td}>
                                            <span style={{ fontWeight: 700, color: "#065f46", fontSize: "15px" }}>
                                                ₹{t.amount.toFixed(2)}
                                            </span>
                                        </td>
                                        <td style={{ ...td, maxWidth: "140px" }}>
                                            <span style={{ color: "#555", fontSize: "13px", lineHeight: "1.5" }}>
                                                {t.reason || "-"}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            {t.status === "completed" && (
                                                <span style={completedPill}>
                                                    <span style={{ fontSize: "8px", marginRight: "5px" }}>●</span> Completed
                                                </span>
                                            )}
                                            {t.status === "pending" && (
                                                <span style={pendingPill}>
                                                    <span style={{ fontSize: "8px", marginRight: "5px" }}>●</span> Pending
                                                </span>
                                            )}
                                            {t.status === "failed" && (
                                                <span style={failedPill}>
                                                    <span style={{ fontSize: "8px", marginRight: "5px" }}>●</span> Failed
                                                </span>
                                            )}
                                        </td>
                                        <td style={td}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <i className="ph ph-calendar-blank" style={{ fontSize: "13px", color: "#aaa" }} />
                                                <span style={{ color: "#999", fontSize: "13px" }}>
                                                    {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={td}>
                                            {t.status === "pending" && (
                                                <div style={{ display: "flex", gap: "6px" }}>
                                                    {t.invoiceUrl && (
                                                        <a href={t.invoiceUrl} target="_blank" rel="noreferrer" style={payNowBtn}>
                                                            <i className="ph ph-arrow-square-out" style={{ fontSize: "12px" }} />
                                                            Pay
                                                        </a>
                                                    )}
                                                    <fetcher.Form method="post">
                                                        <input type="hidden" name="transactionId" value={t.id} />
                                                        <button type="submit" style={markPaidBtn}>
                                                            <i className="ph ph-check" style={{ fontSize: "12px" }} />
                                                            Mark Paid
                                                        </button>
                                                    </fetcher.Form>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const pageWrapper: React.CSSProperties = {
    padding: "28px 32px", background: "#f0f2f8", minHeight: "100vh",
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
};
const card: React.CSSProperties = {
    background: "#ffffff", borderRadius: "20px", border: "1px solid #e8eaed",
    padding: "28px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden",
};
const cardHeader: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "16px",
    marginBottom: "28px", paddingBottom: "24px", borderBottom: "1px solid #f0f0f0",
};
const iconBox: React.CSSProperties = {
    width: "48px", height: "48px", borderRadius: "14px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};
const cardTitle: React.CSSProperties = {
    fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a",
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const theadRow: React.CSSProperties = { background: "#fafafa" };
const th: React.CSSProperties = {
    padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #f0f0f0",
};
const thInner: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "6px",
    fontSize: "11px", fontWeight: 700, color: "#aaa", letterSpacing: "0.6px",
};
const td: React.CSSProperties = { padding: "18px 16px", borderBottom: "1px solid #f5f5f5", verticalAlign: "middle" };
const tableRow: React.CSSProperties = { transition: "background 0.15s ease" };
const avatar: React.CSSProperties = {
    width: "38px", height: "38px", borderRadius: "50%", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "13px", fontWeight: 700, flexShrink: 0,
};
const completedPill: React.CSSProperties = {
    background: "#dcfce7", color: "#166534", padding: "5px 12px",
    borderRadius: "20px", fontSize: "12px", fontWeight: 600,
    display: "inline-flex", alignItems: "center",
};
const pendingPill: React.CSSProperties = {
    background: "#fff7ed", color: "#c2410c", padding: "5px 12px",
    borderRadius: "20px", fontSize: "12px", fontWeight: 600,
    display: "inline-flex", alignItems: "center",
};
const failedPill: React.CSSProperties = {
    background: "#fef2f2", color: "#dc2626", padding: "5px 12px",
    borderRadius: "20px", fontSize: "12px", fontWeight: 600,
    display: "inline-flex", alignItems: "center",
};
const payNowBtn: React.CSSProperties = {
    padding: "5px 10px", background: "#065f46", color: "#fff",
    borderRadius: "6px", textDecoration: "none", fontSize: "12px",
    fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px",
};
const markPaidBtn: React.CSSProperties = {
    padding: "5px 10px", background: "#374151", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px",
};
const emptyState: React.CSSProperties = { textAlign: "center", padding: "60px 0" };

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};