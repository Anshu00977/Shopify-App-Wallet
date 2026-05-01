import { type LoaderFunctionArgs } from "react-router";
import db from "../db.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId") || "";

    if (!customerId) {
        return Response.json({ balance: 0 }, { headers: corsHeaders });
    }

    const wallet = await db.wallet.findUnique({ where: { customerId } });

    return Response.json({ balance: wallet?.balance ?? 0 }, { headers: corsHeaders });
}