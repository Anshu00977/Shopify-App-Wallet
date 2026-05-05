import { type LoaderFunctionArgs } from "react-router";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId") || "";
    const shop = url.searchParams.get("shop") || "";

    let balance = 0;
    if (customerId) {
        const wallet = await db.wallet.findUnique({ where: { customerId } });
        balance = wallet?.balance ?? 0;
    }

    return { balance, customerId, shop };
}

export default function WalletPage() {
    return <div>Wallet Page</div>;
}