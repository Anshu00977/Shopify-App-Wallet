import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || "";
    const customerId = url.searchParams.get("customerId") || "";
    const customerName = url.searchParams.get("customerName") || "";
    const customerEmail = url.searchParams.get("customerEmail") || "";
    const orderId = url.searchParams.get("orderId") || "";
    const orderName = url.searchParams.get("orderName") || "";
    const orderTotal = url.searchParams.get("orderTotal") || "0";
    return { shop, customerId, customerName, customerEmail, orderId, orderName, orderTotal };
}

export async function action({ request }: ActionFunctionArgs) {
    const url = new URL(request.url);
    const formData = await request.formData();

    const shop = (formData.get("shop") || url.searchParams.get("shop")) as string;
    const customerId = (formData.get("customerId") || url.searchParams.get("customerId")) as string;
    const customerName = (formData.get("customerName") || url.searchParams.get("customerName")) as string;
    const customerEmail = (formData.get("customerEmail") || url.searchParams.get("customerEmail")) as string;
    const orderId = (formData.get("orderId") || url.searchParams.get("orderId")) as string;
    const orderName = (formData.get("orderName") || url.searchParams.get("orderName")) as string;
    const orderTotal = (formData.get("orderTotal") || url.searchParams.get("orderTotal") || "0") as string;
    const reason = formData.get("reason") as string;

    if (!reason?.trim()) return { error: "Please provide a reason." };

    await db.refundRequest.create({
        data: {
            shop: shop || "unknown",
            customerId: customerId || "unknown",
            customerName: customerName || "unknown",
            orderId: orderId || "unknown",
            orderName: orderName || "unknown",
            amount: parseFloat(orderTotal),
            reason,
            status: "pending",
        },
    });

    return { success: true };
}

export default function RefundRequestPage() {
    const { shop, customerId, customerName, customerEmail, orderId, orderName, orderTotal } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();

    const isLoading = fetcher.state === "submitting";
    const success = fetcher.data?.success;
    const error = fetcher.data?.error;

    if (success) {
        return (
            <div style={pageWrapper}>
                <div style={card}>
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                        <div style={{ fontSize: "48px" }}>✅</div>
                        <h2 style={{ fontWeight: 700, fontSize: "20px", margin: "12px 0 8px" }}>Request Submitted!</h2>
                        <p style={{ color: "#666", fontSize: "14px" }}>
                            Your refund request has been submitted. We'll review it and credit your wallet shortly.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={pageWrapper}>
            <div style={card}>
                <div style={cardHeader}>
                    <div style={iconBox}>💳</div>
                    <div>
                        <h2 style={cardTitle}>Request Refund to Wallet</h2>
                        <p style={cardSubtitle}>Submit a refund request for your order</p>
                    </div>
                </div>

                {customerName && (
                    <div style={{ ...orderBox, marginBottom: "12px" }}>
                        <span style={{ color: "#666", fontSize: "13px" }}>Customer</span>
                        <div style={{ textAlign: "right" }}>
                            <span style={{ fontWeight: 700, fontSize: "14px", display: "block" }}>{customerName}</span>
                            <span style={{ color: "#888", fontSize: "12px" }}>{customerEmail}</span>
                        </div>
                    </div>
                )}

                {orderName && (
                    <div style={{ ...orderBox, marginBottom: "12px" }}>
                        <span style={{ color: "#666", fontSize: "13px" }}>Order</span>
                        <span style={{ fontWeight: 700, fontSize: "15px" }}>{orderName}</span>
                    </div>
                )}

                {orderTotal && parseFloat(orderTotal) > 0 && (
                    <div style={orderBox}>
                        <span style={{ color: "#666", fontSize: "13px" }}>Refund Amount</span>
                        <span style={{ fontWeight: 700, fontSize: "15px", color: "#065f46" }}>
                            ₹{parseFloat(orderTotal).toFixed(2)}
                        </span>
                    </div>
                )}

                {error && <div style={alertError}>⚠️ {error}</div>}

                <fetcher.Form method="post" action="/apps/vaultwallet/refund-request">
                    <input type="hidden" name="shop" value={shop} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="customerName" value={customerName} />
                    <input type="hidden" name="customerEmail" value={customerEmail} />
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="orderName" value={orderName} />
                    <input type="hidden" name="orderTotal" value={orderTotal} />

                    <div style={formGroup}>
                        <label style={label}>Reason for Refund</label>
                        <textarea
                            name="reason"
                            style={textarea}
                            placeholder="e.g. Wrong item received, damaged product..."
                            rows={4}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        style={isLoading ? { ...submitBtn, opacity: 0.7 } : submitBtn}
                        disabled={isLoading}
                    >
                        {isLoading ? "Submitting..." : "Submit Request"}
                    </button>
                </fetcher.Form>
            </div>
        </div>
    );
}

const pageWrapper: React.CSSProperties = {
    minHeight: "100vh", background: "#f0f2f8",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Segoe UI', -apple-system, sans-serif", padding: "20px",
};
const card: React.CSSProperties = {
    background: "#fff", borderRadius: "20px", border: "1px solid #e8eaed",
    padding: "36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    width: "100%", maxWidth: "500px",
};
const cardHeader: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "16px",
    marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid #f0f0f0",
};
const iconBox: React.CSSProperties = {
    width: "52px", height: "52px", borderRadius: "14px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
};
const cardTitle: React.CSSProperties = { fontSize: "18px", fontWeight: 700, margin: 0, color: "#1a1a1a" };
const cardSubtitle: React.CSSProperties = { fontSize: "13px", color: "#999", margin: "3px 0 0" };
const orderBox: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#f9fafb", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px",
};
const formGroup: React.CSSProperties = { marginBottom: "20px" };
const label: React.CSSProperties = {
    display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "13px", color: "#444",
};
const textarea: React.CSSProperties = {
    width: "100%", padding: "12px 14px", border: "1.5px solid #e8eaed",
    borderRadius: "10px", fontSize: "14px", resize: "vertical",
    fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};
const submitBtn: React.CSSProperties = {
    width: "100%", padding: "14px",
    background: "linear-gradient(135deg, #0f3d2e, #065f46)",
    color: "#fff", border: "none", borderRadius: "12px",
    fontSize: "15px", fontWeight: 700, cursor: "pointer",
};
const alertError: React.CSSProperties = {
    background: "#fff5f5", border: "1px solid #ffcdd2", color: "#c62828",
    padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", fontSize: "14px",
};