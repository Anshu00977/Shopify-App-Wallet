import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export async function action({ request }: ActionFunctionArgs) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const { admin } = await authenticate.public.appProxy(request);
        const body = await request.json();
        const { customerId, shop, amount } = body;

        if (!customerId || !shop || !amount) {
            return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
        }

        const response = await admin.graphql(`
            mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                    draftOrder {
                        id
                        invoiceUrl
                    }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                input: {
                    lineItems: [{
                        title: "Wallet Top-up",
                        quantity: 1,
                        originalUnitPrice: amount.toString(),
                    }],
                    customerId,
                    tags: ["vaultwallet-topup"],
                    note: `Wallet top-up for ${customerId}`,
                }
            }
        });

        const data = await response.json();
        const userErrors = data.data?.draftOrderCreate?.userErrors;

        if (userErrors?.length > 0) {
            return Response.json({ error: userErrors[0].message }, { status: 400, headers: corsHeaders });
        }

        const invoiceUrl = data.data?.draftOrderCreate?.draftOrder?.invoiceUrl;
        return Response.json({ success: true, invoiceUrl }, { headers: corsHeaders });

    } catch (err: any) {
        console.error("topup-wallet error:", err);
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}