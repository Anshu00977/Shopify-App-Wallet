import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const wallets = await db.wallet.findMany({
    where: { shop: session.shop },
  });

  const transactions = await db.transaction.findMany({
    where: { wallet: { shop: session.shop } },
    include: { wallet: true },
    orderBy: { createdAt: "desc" },
  });

  // Stats
  const totalWallets = wallets.length;
  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  const totalCredits = transactions
    .filter((t) => t.type === "credit" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);
  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  // Last 7 days chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      dateObj: date,
      amount: 0,
    };
  });

  transactions
    .filter((t) => t.type === "credit" && t.status === "completed")
    .forEach((t) => {
      const txDate = new Date(t.createdAt);
      const day = last7Days.find(
        (d) => d.dateObj.toDateString() === txDate.toDateString()
      );
      if (day) day.amount += t.amount;
    });

  // Recent 5 transactions
  const recentTransactions = transactions.slice(0, 5);

  // Fetch customer details
  const customerResponse = await admin.graphql(`
    #graphql
    query getCustomers {
      customers(first: 50) {
        edges {
          node {
            id
            displayName
            email
          }
        }
      }
    }
  `);

  const customerData = await customerResponse.json();
  const customers = customerData.data?.customers?.edges?.map((e: any) => e.node) || [];
  const customerMap: Record<string, { displayName: string; email: string }> = {};
  customers.forEach((c: any) => {
    customerMap[c.id] = { displayName: c.displayName, email: c.email };
  });

  return {
    totalWallets,
    totalBalance,
    totalCredits,
    pendingCount,
    chartData: last7Days.map((d) => ({ date: d.date, amount: d.amount })),
    recentTransactions,
    customerMap,
  };
};

export default function Index() {
  const {
    totalWallets,
    totalBalance,
    totalCredits,
    pendingCount,
    chartData,
    recentTransactions,
    customerMap,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="✦ 𝓥𝓪𝓾𝓵𝓽𝓦𝓪𝓵𝓵𝓮𝓽 — 𝓓𝓪𝓼𝓱𝓫𝓸𝓪𝓻𝓭">

      {/* Stats Cards */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <div style={statCard}>
            <p style={statLabel}>Total Wallets</p>
            <p style={statValue}>{totalWallets}</p>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #008060" }}>
            <p style={statLabel}>Total Balance</p>
            <p style={{ ...statValue, color: "#008060" }}>₹{totalBalance.toFixed(2)}</p>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #1a73e8" }}>
            <p style={statLabel}>Total Credits Issued</p>
            <p style={{ ...statValue, color: "#1a73e8" }}>₹{totalCredits.toFixed(2)}</p>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid orange" }}>
            <p style={statLabel}>Pending Transactions</p>
            <p style={{ ...statValue, color: "orange" }}>{pendingCount}</p>
          </div>
        </div>
      </s-section>

      {/* Chart */}
      <s-section heading="Credits Issued — Last 7 Days">
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
              <Bar dataKey="amount" fill="#008060" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </s-section>

      {/* Recent Transactions */}
      <s-section heading="Recent Transactions">
        {recentTransactions.length === 0 ? (
          <s-paragraph>No transactions yet.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={th}>Customer</th>
                <th style={th}>Type</th>
                <th style={th}>Amount</th>
                <th style={th}>Status</th>
                <th style={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((t) => {
                const customer = customerMap[t.wallet.customerId];
                return (
                  <tr key={t.id}>
                    <td style={td}>{customer?.displayName || t.wallet.customerId}</td>
                    <td style={td}>
                      <span style={{ color: t.type === "credit" ? "green" : "red", fontWeight: "bold" }}>
                        {t.type === "credit" ? "↑ Credit" : "↓ Debit"}
                      </span>
                    </td>
                    <td style={td}>₹{t.amount.toFixed(2)}</td>
                    <td style={td}>
                      <span style={{
                        color: t.status === "completed" ? "green" : t.status === "pending" ? "orange" : "red",
                        fontWeight: "bold",
                        textTransform: "capitalize",
                      }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={td}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </s-section>

    </s-page>
  );
}

const statCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderTop: "4px solid #ccc",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center",
};

const statLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "#666",
  marginBottom: "8px",
};

const statValue: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "bold",
  margin: 0,
};

const th: React.CSSProperties = { padding: "10px", textAlign: "left", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #eee" };

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};