import { type ActionFunctionArgs } from "react-router";
import db from "../db.server";
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
    const { admin, session } = await authenticate.public.appProxy(request);
    const body = await request.json();
    const { customerId, shop, amount } = body;

    if (!customerId || !shop || !amount) {
      return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
    }

    const wallet = await db.wallet.findUnique({ where: { customerId } });
    if (!wallet || wallet.balance < amount) {
      return Response.json({ error: "Insufficient wallet balance" }, { status: 400, headers: corsHeaders });
    }

    // Cancel any existing PENDING coupon for this customer
    const existingPending = await db.transaction.findMany({
      where: {
        walletId: wallet.id,
        status: "PENDING",
        type: "DEBIT",
      }
    });

    for (const tx of existingPending) {
      const oldCode = tx.orderId; // coupon code stored as orderId
      if (oldCode?.startsWith("WALLET-")) {
        // Deactivate old discount code via Shopify API
        try {
          // Find the discount by title and delete it
          const findRes = await admin.graphql(`
                        query {
                            codeDiscountNodes(first: 1, query: "title:${oldCode}") {
                                nodes {
                                    id
                                }
                            }
                        }
                    `);
          const findData = await findRes.json();
          const discountId = findData.data?.codeDiscountNodes?.nodes?.[0]?.id;

          if (discountId) {
            await admin.graphql(`
                            mutation discountCodeDeactivate($id: ID!) {
                                discountCodeDeactivate(id: $id) {
                                    userErrors { field message }
                                }
                            }
                        `, { variables: { id: discountId } });
          }
        } catch (e) {
          console.error("Failed to deactivate old coupon:", e);
        }

        // Mark old transaction as CANCELLED
        await db.transaction.update({
          where: { id: tx.id },
          data: { status: "CANCELLED" }
        });
      }
    }

    // Generate new coupon code
    const code = `WALLET-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create discount code via Shopify Admin API
    const response = await admin.graphql(`
            mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `, {
      variables: {
        basicCodeDiscount: {
          title: code,
          code: code,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          customerSelection: { all: true },
          customerGets: {
            value: {
              discountAmount: {
                amount: amount.toString(),
                appliesOnEachItem: false
              }
            },
            items: { all: true }
          },
          appliesOncePerCustomer: true,
          usageLimit: 1
        }
      }
    });

    const data = await response.json();
    const userErrors = data.data?.discountCodeBasicCreate?.userErrors;

    if (userErrors?.length > 0) {
      return Response.json({ error: userErrors[0].message }, { status: 400, headers: corsHeaders });
    }

    // Save new pending transaction
    await db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "DEBIT",
        amount: amount,
        reason: `Wallet coupon applied: ${code}`,
        status: "PENDING",
        orderId: code,
      }
    });

    return Response.json({ success: true, code }, { headers: corsHeaders });

  } catch (err: any) {
    console.error("apply-wallet error:", err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}