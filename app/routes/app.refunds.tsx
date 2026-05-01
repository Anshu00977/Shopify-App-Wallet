import { type LoaderFunctionArgs, type ActionFunctionArgs, type HeadersFunction } from "react-router";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);

    const refundRequests = await db.refundRequest.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
    });

    return { refundRequests };
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const requestId = parseInt(formData.get("requestId") as string);
    const actionType = formData.get("actionType") as string;
    const customerId = formData.get("customerId") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const orderId = formData.get("orderId") as string;
    const reason = formData.get("reason") as string;

    if (actionType === "approve") {
        let wallet = await db.wallet.findUnique({ where: { customerId } });
        if (!wallet) {
            wallet = await db.wallet.create({
                data: { shop: session.shop, customerId, balance: 0 },
            });
        }

        await db.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
        });

        await db.transaction.create({
            data: {
                walletId: wallet.id,
                type: "credit",
                amount,
                reason: `Approved refund: ${reason}`,
                status: "completed",
                orderId,
            },
        });

        await db.refundRequest.update({
            where: { id: requestId },
            data: { status: "approved" },
        });

    } else if (actionType === "reject") {
        await db.refundRequest.update({
            where: { id: requestId },
            data: { status: "rejected" },
        });
    }

    return { success: true };
}

export default function RefundsPage() {
    const { refundRequests } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();

    return (
        <div style={pageWrapper}>
            <div style={card}>
                <div style={cardHeader}>
                    <div style={iconBox}>
                        <i className="ph ph-arrow-u-up-left" style={{ fontSize: "22px", color: "white" }} />
                    </div>
                    <h2 style={cardTitle}>Refund Requests</h2>
                </div>

                {refundRequests.length === 0 ? (
                    <div style={emptyState}>
                        <i className="ph ph-arrow-u-up-left" style={{ fontSize: "48px", color: "#ccc" }} />
                        <p style={{ color: "#aaa", marginTop: "12px" }}>No refund requests yet.</p>
                    </div>
                ) : (
                    <table style={table}>
                        <thead>
                            <tr style={theadRow}>
                                <th style={th}>#</th>
                                <th style={th}><span style={thInner}><i className="ph ph-receipt" style={{ fontSize: "13px" }} /> ORDER</span></th>
                                <th style={th}><span style={thInner}><i className="ph ph-user" style={{ fontSize: "13px" }} /> CUSTOMER</span></th>
                                <th style={th}><span style={thInner}><i className="ph ph-currency-inr" style={{ fontSize: "13px" }} /> AMOUNT</span></th>
                                <th style={th}><span style={thInner}><i className="ph ph-chat-text" style={{ fontSize: "13px" }} /> REASON</span></th>
                                <th style={th}><span style={thInner}><i className="ph ph-check-circle" style={{ fontSize: "13px" }} /> STATUS</span></th>
                                <th style={th}><span style={thInner}><i className="ph ph-calendar" style={{ fontSize: "13px" }} /> DATE</span></th>
                                <th style={th}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {refundRequests.map((r, index) => (
                                <tr
                                    key={r.id}
                                    style={tableRow}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                    <td style={{ ...td, color: "#aaa" }}>{index + 1}</td>
                                    <td style={td}><span style={{ fontWeight: 600 }}>{r.orderName}</span></td>
                                    <td style={td}>
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                            <span style={{ fontWeight: 600, fontSize: "14px" }}>{r.customerName || r.customerId}</span>
                                            <span style={{ color: "#888", fontSize: "12px" }}>{r.customerId}</span>
                                        </div>
                                    </td>
                                    <td style={td}><span style={{ fontWeight: 700, color: "#065f46" }}>₹{r.amount.toFixed(2)}</span></td>
                                    <td style={{ ...td, maxWidth: "200px" }}><span style={{ color: "#555", fontSize: "13px" }}>{r.reason}</span></td>
                                    <td style={td}>
                                        {r.status === "pending" && <span style={pendingPill}><span style={{ fontSize: "8px", marginRight: "5px" }}>●</span>Pending</span>}
                                        {r.status === "approved" && <span style={approvedPill}><span style={{ fontSize: "8px", marginRight: "5px" }}>●</span>Approved</span>}
                                        {r.status === "rejected" && <span style={rejectedPill}><span style={{ fontSize: "8px", marginRight: "5px" }}>●</span>Rejected</span>}
                                    </td>
                                    <td style={td}><span style={{ color: "#999", fontSize: "13px" }}>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></td>
                                    <td style={td}>
                                        {r.status === "pending" && (
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <fetcher.Form method="post">
                                                    <input type="hidden" name="requestId" value={r.id} />
                                                    <input type="hidden" name="customerId" value={r.customerId} />
                                                    <input type="hidden" name="amount" value={r.amount} />
                                                    <input type="hidden" name="orderId" value={r.orderId} />
                                                    <input type="hidden" name="reason" value={r.reason} />
                                                    <input type="hidden" name="actionType" value="approve" />
                                                    <button type="submit" style={approveBtn}>
                                                        <i className="ph ph-check" style={{ fontSize: "12px" }} /> Approve
                                                    </button>
                                                </fetcher.Form>
                                                <fetcher.Form method="post">
                                                    <input type="hidden" name="requestId" value={r.id} />
                                                    <input type="hidden" name="customerId" value={r.customerId} />
                                                    <input type="hidden" name="amount" value={r.amount} />
                                                    <input type="hidden" name="orderId" value={r.orderId} />
                                                    <input type="hidden" name="reason" value={r.reason} />
                                                    <input type="hidden" name="actionType" value="reject" />
                                                    <button type="submit" style={rejectBtn}>
                                                        <i className="ph ph-x" style={{ fontSize: "12px" }} /> Reject
                                                    </button>
                                                </fetcher.Form>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const pageWrapper: React.CSSProperties = { padding: "28px 32px", background: "#f0f2f8", minHeight: "100vh", fontFamily: "'Segoe UI', -apple-system, sans-serif" };
const card: React.CSSProperties = { background: "#ffffff", borderRadius: "20px", border: "1px solid #e8eaed", padding: "28px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" };
const cardHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px", paddingBottom: "24px", borderBottom: "1px solid #f0f0f0" };
const iconBox: React.CSSProperties = { width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #0f3d2e, #065f46)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" };
const cardTitle: React.CSSProperties = { fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const theadRow: React.CSSProperties = { background: "#fafafa" };
const th: React.CSSProperties = { padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #f0f0f0" };
const thInner: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "#aaa", letterSpacing: "0.6px" };
const td: React.CSSProperties = { padding: "16px", borderBottom: "1px solid #f5f5f5", verticalAlign: "middle" };
const tableRow: React.CSSProperties = { transition: "background 0.15s ease" };
const pendingPill: React.CSSProperties = { background: "#fff7ed", color: "#c2410c", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const approvedPill: React.CSSProperties = { background: "#dcfce7", color: "#166534", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const rejectedPill: React.CSSProperties = { background: "#fef2f2", color: "#dc2626", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const approveBtn: React.CSSProperties = { padding: "5px 10px", background: "#065f46", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" };
const rejectBtn: React.CSSProperties = { padding: "5px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" };
const emptyState: React.CSSProperties = { textAlign: "center", padding: "60px 0" };

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};