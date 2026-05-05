import { type ActionFunctionArgs, type LoaderFunctionArgs, type HeadersFunction } from "react-router";
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
    const orderId = formData.get("orderId") as string;
    const reason = formData.get("reason") as string;

    if (actionType === "approve") {
        const approveAmount = parseFloat(formData.get("approveAmount") as string);

        const numericOrderId = orderId.includes("/")
            ? orderId.split("/").pop()!
            : orderId;

        console.log("approveAmount:", approveAmount);
        console.log("orderId:", orderId);
        console.log("numericOrderId:", numericOrderId);
        console.log("customerId:", customerId);

        const walletTx = await db.transaction.findFirst({
            where: { type: "DEBIT", status: "COMPLETED", orderId: numericOrderId },
        });

        console.log("walletTx found:", JSON.stringify(walletTx));


        const walletPaid = walletTx?.amount ?? 0;
        const walletRefund = Math.min(approveAmount, walletPaid);
        const otherRefund = approveAmount - walletRefund;

        let wallet = await db.wallet.findUnique({ where: { customerId } });
        if (!wallet) {
            wallet = await db.wallet.create({
                data: { shop: session.shop, customerId, balance: 0 },
            });
        }

        if (walletRefund > 0) {
            await db.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: walletRefund } },
            });

            await db.transaction.create({
                data: {
                    walletId: wallet.id,
                    type: "credit",
                    amount: walletRefund,
                    reason: `Refund to wallet: ${reason}`,
                    status: "completed",
                    orderId,
                },
            });
        }

        await db.refundRequest.update({
            where: { id: requestId },
            data: { status: "approved", amount: approveAmount },
        });

        return { success: true, walletRefund, otherRefund };

    } else if (actionType === "reject") {
        await db.refundRequest.update({
            where: { id: requestId },
            data: { status: "rejected" },
        });
        return { success: true };
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

                {fetcher.data?.walletRefund > 0 && (
                    <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "14px", color: "#166534" }}>
                        ✅ ₹{fetcher.data.walletRefund} credited to wallet.
                        {fetcher.data.otherRefund > 0 && ` Please manually refund ₹${fetcher.data.otherRefund} via original payment method.`}
                    </div>
                )}

                {refundRequests.length === 0 ? (
                    <div style={emptyState}>
                        <p style={{ color: "#aaa", marginTop: "12px" }}>No refund requests yet.</p>
                    </div>
                ) : (
                    <table style={table}>
                        <thead>
                            <tr style={theadRow}>
                                <th style={th}>#</th>
                                <th style={th}>ORDER</th>
                                <th style={th}>CUSTOMER</th>
                                <th style={th}>AMOUNT</th>
                                <th style={th}>REASON</th>
                                <th style={th}>STATUS</th>
                                <th style={th}>DATE</th>
                                <th style={th}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {refundRequests.map((r, index) => (
                                <tr key={r.id} style={tableRow}
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
                                        {r.status === "pending" && <span style={pendingPill}>● Pending</span>}
                                        {r.status === "approved" && <span style={approvedPill}>● Approved</span>}
                                        {r.status === "rejected" && <span style={rejectedPill}>● Rejected</span>}
                                    </td>
                                    <td style={td}><span style={{ color: "#999", fontSize: "13px" }}>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></td>
                                    <td style={td}>
                                        {r.status === "pending" && (
                                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                <fetcher.Form method="post" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                    <input type="hidden" name="requestId" value={r.id} />
                                                    <input type="hidden" name="customerId" value={r.customerId} />
                                                    <input type="hidden" name="orderId" value={r.orderId} />
                                                    <input type="hidden" name="reason" value={r.reason} />
                                                    <input type="hidden" name="actionType" value="approve" />
                                                    <input
                                                        type="number"
                                                        name="approveAmount"
                                                        placeholder="₹ Amount"
                                                        style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #ccc", width: "90px", fontSize: "12px" }}
                                                        required
                                                    />
                                                    <button type="submit" style={approveBtn}>✓ Approve</button>
                                                </fetcher.Form>
                                                <fetcher.Form method="post">
                                                    <input type="hidden" name="requestId" value={r.id} />
                                                    <input type="hidden" name="customerId" value={r.customerId} />
                                                    <input type="hidden" name="orderId" value={r.orderId} />
                                                    <input type="hidden" name="reason" value={r.reason} />
                                                    <input type="hidden" name="actionType" value="reject" />
                                                    <button type="submit" style={rejectBtn}>✕ Reject</button>
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
const iconBox: React.CSSProperties = { width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #0f3d2e, #065f46)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const cardTitle: React.CSSProperties = { fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const theadRow: React.CSSProperties = { background: "#fafafa" };
const th: React.CSSProperties = { padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #f0f0f0", fontSize: "11px", fontWeight: 700, color: "#aaa", letterSpacing: "0.6px" };
const td: React.CSSProperties = { padding: "16px", borderBottom: "1px solid #f5f5f5", verticalAlign: "middle" };
const tableRow: React.CSSProperties = { transition: "background 0.15s ease" };
const pendingPill: React.CSSProperties = { background: "#fff7ed", color: "#c2410c", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const approvedPill: React.CSSProperties = { background: "#dcfce7", color: "#166534", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const rejectedPill: React.CSSProperties = { background: "#fef2f2", color: "#dc2626", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center" };
const approveBtn: React.CSSProperties = { padding: "5px 10px", background: "#065f46", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 };
const rejectBtn: React.CSSProperties = { padding: "5px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 };
const emptyState: React.CSSProperties = { textAlign: "center", padding: "60px 0" };

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};