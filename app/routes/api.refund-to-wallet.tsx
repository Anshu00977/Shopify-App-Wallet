import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: ActionFunctionArgs) {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    return new Response(null, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const { session } = await authenticate.admin(request);
        const body = await request.json();
        const { customerId, amount, reason, orderId } = body;

        if (!customerId || !amount || amount <= 0) {
            return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders });
        }

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
                reason: reason || "Refund to wallet",
                status: "completed",
                orderId,
            },
        });

        return Response.json({ success: true }, { headers: corsHeaders });
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}