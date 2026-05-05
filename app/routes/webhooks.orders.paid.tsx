import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
    const { topic, payload, shop } = await authenticate.webhook(request);

    if (topic === "ORDERS_PAID") {
        const order = payload as any;
        const tags: string[] = order.tags?.split(", ") || [];
        const customerId = `gid://shopify/Customer/${order.customer?.id}`;

        // --- TOP-UP FLOW ---
        if (tags.includes("vaultwallet-topup")) {
            const amount = parseFloat(order.total_price);

            let wallet = await db.wallet.findUnique({ where: { customerId } });

            if (!wallet) {
                wallet = await db.wallet.create({
                    data: { shop, customerId, balance: 0 },
                });
            }

            await db.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });

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

        // --- WALLET COUPON DEDUCTION FLOW ---
        const discountCodes: any[] = order.discount_codes || [];
        console.log("ORDER DISCOUNT CODES:", JSON.stringify(discountCodes));
        console.log("ORDER TAGS:", order.tags);
        console.log("ORDER ID:", order.id);
        const walletCoupon = discountCodes.find((d: any) =>
            d.code?.startsWith("WALLET-")
        );

        if (walletCoupon) {
            const couponCode = walletCoupon.code;
            const discountAmount = parseFloat(walletCoupon.amount);

            const wallet = await db.wallet.findUnique({ where: { customerId } });

            if (wallet) {
                // Find the pending transaction for this coupon
                const pendingTx = await db.transaction.findFirst({
                    where: {
                        walletId: wallet.id,
                        status: "PENDING",
                        type: "DEBIT",
                        orderId: couponCode,
                    },
                });

                console.log("pendingTx found:", JSON.stringify(pendingTx));

                if (pendingTx) {
                    // Deduct from wallet and mark completed
                    await db.wallet.update({
                        where: { id: wallet.id },
                        data: { balance: { decrement: discountAmount } },
                    });

                    await db.transaction.update({
                        where: { id: pendingTx.id },
                        data: {
                            status: "COMPLETED",
                            orderId: order.id?.toString(),
                            reason: `Wallet coupon redeemed: ${couponCode}`,
                        },
                    });
                }
            }
        }
    }

    return new Response("ok", { status: 200 });
}