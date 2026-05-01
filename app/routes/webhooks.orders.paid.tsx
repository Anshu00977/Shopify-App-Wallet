import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
    const { topic, payload, shop } = await authenticate.webhook(request);

    if (topic === "ORDERS_PAID") {
        const order = payload as any;
        const tags: string[] = order.tags?.split(", ") || [];

        if (tags.includes("vaultwallet-topup")) {
            const customerId = `gid://shopify/Customer/${order.customer?.id}`;
            const amount = parseFloat(order.total_price);

            let wallet = await db.wallet.findUnique({ where: { customerId } });

            if (!wallet) {
                wallet = await db.wallet.create({
                    data: { shop, customerId, balance: 0 },
                });
            }

            // Update wallet balance
            await db.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });

            // Find pending transaction and mark completed
            const pendingTx = await db.transaction.findFirst({
                where: {
                    walletId: wallet.id,
                    status: "pending",
                    type: "credit",
                },
                orderBy: { createdAt: "desc" },
            });

            if (pendingTx) {
                await db.transaction.update({
                    where: { id: pendingTx.id },
                    data: { status: "completed" },
                });
            } else {
                // Create new completed transaction if no pending found
                await db.transaction.create({
                    data: {
                        walletId: wallet.id,
                        type: "credit",
                        amount,
                        reason: "Wallet top-up via Shopify checkout",
                        status: "completed",
                    },
                });
            }
        }
    }

    return new Response("ok", { status: 200 });
}