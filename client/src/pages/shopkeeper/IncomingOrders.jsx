import { T } from "../../i18n/LanguageContext";
import { useEffect, useState } from "react";
import { useShop } from "./ShopPages";
import {
  useData,
  QueryState,
  PageHeading,
  Pagination,
} from "../../components/MarketUI";
import { OrderPanel } from "../customer/Orders";
export const statuses = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];
export function IncomingOrders({ past = false }) {
  const shop = useShop();
  const [page, setPage] = useState(1);
  const section = past ? "past" : "incoming";
  const query = useData(
    ["shop-orders", shop._id, section, page],
    `/shops/${shop._id}/orders?${new URLSearchParams({ page, section, sort: past ? "newest" : "oldest" })}`,
    { refetchInterval: 15000 },
  );
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.pages)) {
      setPage(Math.max(1, query.data.pages));
    }
  }, [query.data, page]);
  return (
    <>
      <PageHeading
        eyebrow="Every order is a neighborhood connection"
        title={past ? "Past orders" : "Incoming orders"}
      />
      <p className="muted">
        <T>
          {past
            ? "Completed, rejected and cancelled orders, newest first."
            : "Active orders, earliest received first. Finished orders move to Past orders."}
        </T>
      </p>
      <QueryState query={query}>
        {query.data?.items.length === 0 && (
          <div className="panel">
            <p>
              <T>
                {past ? "No past orders yet." : "No incoming orders right now."}
              </T>
            </p>
          </div>
        )}
        {query.data?.items.map((order) => (
          <div
            className={order.orderStatus === "PENDING" ? "new-order" : ""}
            key={order._id}
          >
            <OrderPanel order={order} manage />
          </div>
        ))}
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
