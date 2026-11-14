import { T } from "../../i18n/LanguageContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { notificationText } from "../../i18n/notifications";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  useData,
  QueryState,
  Pagination,
  Status,
  PageHeading,
  Form,
} from "../../components/MarketUI";
import { Button } from "../../components/UI";
import { useCommerce } from "../../context/CommerceContext";
import { useAuth } from "../../context/AuthContext";
import { money, dateTime, label } from "../../utils/format";
import { api } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";
export function Orders() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const query = useData(["my-orders", page], `/orders/my?page=${page}`, {
    refetchInterval: 30000,
  });
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Every basket has a story"
        title={t("Your orders")}
      />
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="order-list">
          {query.data?.items.map((order) => (
            <Link
              to={`/orders/${order._id}`}
              key={order._id}
              className="order-summary panel"
            >
              <div>
                <strong
                  className={
                    order.orderStatus === "PENDING"
                      ? "order-number-pending"
                      : undefined
                  }
                >
                  {order.orderNumber}
                </strong>
                <p>
                  {order.shopId?.name} · {dateTime(order.createdAt)}
                </p>
                <span>
                  {order.items.length} products ·{" "}
                  {t(label(order.fulfillmentMethod))}
                </span>
              </div>
              <div>
                <Status value={order.orderStatus} />
                <h3>{money(order.totalAmount)}</h3>
              </div>
            </Link>
          ))}
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </section>
  );
}
export function OrderDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const query = useData(["order", id], `/orders/${id}`, {
    refetchInterval: 15000,
  });
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Your order, step by step"
        title={t("Order details")}
      />
      <QueryState query={query}>
        {query.data && <OrderPanel order={query.data.order} />}
      </QueryState>
    </section>
  );
}
export function OrderPanel({ order, manage = false }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { cart, clear, add, notify } = useCommerce();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [reorderBusy, setReorderBusy] = useState(false);
  const steps = [
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    order.fulfillmentMethod === "pickup"
      ? "READY_FOR_PICKUP"
      : "OUT_FOR_DELIVERY",
    "COMPLETED",
  ];
  const next = {
    PENDING: "ACCEPTED",
    ACCEPTED: "PREPARING",
    PREPARING:
      order.fulfillmentMethod === "pickup"
        ? "READY_FOR_PICKUP"
        : "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "COMPLETED",
  }[order.orderStatus];
  async function action(status, reason) {
    await api.patch(`/orders/${order._id}/status`, {
      status,
      ...(reason ? { reason } : {}),
    });
    await cache.invalidateQueries();
    notify("Order updated.");
  }
  return (
    <div className="order-detail panel">
      <div className="section-title">
        <div>
          <h2
            className={
              order.orderStatus === "PENDING"
                ? "order-number-pending"
                : undefined
            }
          >
            {order.orderNumber}
          </h2>
          <p className="muted">
            {dateTime(order.createdAt)} · {t(label(order.fulfillmentMethod))}
          </p>
        </div>
        <Status value={order.orderStatus} />
      </div>
      <div className="order-steps">
        {steps.map((status, index) => (
          <div
            className={steps.indexOf(order.orderStatus) >= index ? "done" : ""}
            key={status}
          >
            <i>{index + 1}</i>
            <span>{t(label(status))}</span>
          </div>
        ))}
      </div>
      <div className="cart-layout">
        <div>
          <h3>
            <T>{"Items"}</T>
          </h3>
          {order.items.map((item) => (
            <div className="total-row" key={item.productId}>
              <span>
                {item.quantity} × {item.name}
                <small> · {item.unit}</small>
              </span>
              <strong>{money(item.price * item.quantity)}</strong>
            </div>
          ))}
          <div className="total-row">
            <span>
              <T>{"Delivery fee"}</T>
            </span>
            <span>{money(order.deliveryFee)}</span>
          </div>
          <div className="total-row grand">
            <span>
              <T>{"Total"}</T>
            </span>
            <strong>{money(order.totalAmount)}</strong>
          </div>
          <p className="muted">
            {t(label(order.paymentMethod))} · {t(label(order.paymentStatus))}
          </p>
        </div>
        <div>
          <h3>
            <T>{"Customer & fulfillment"}</T>
          </h3>
          <p>
            {order.customerName} ·{" "}
            <a href={`tel:${order.phone}`}>{order.phone}</a>
          </p>
          {order.deliveryAddress && (
            <p>
              {order.deliveryAddress.line}, {order.deliveryAddress.city} –{" "}
              {order.deliveryAddress.pinCode}
              <br />
              {order.deliveryWindow}
            </p>
          )}
          {order.notes && (
            <p>
              <T>{"Notes:"}</T> {order.notes}
            </p>
          )}
          {order.pickupCode && (
            <div className="pickup-code">
              <small>
                <T>{"Show this code only when collecting your order"}</T>
              </small>
              <strong>{order.pickupCode}</strong>
            </div>
          )}
          {order.rejectionReason && (
            <p className="notice">
              <T>{"Rejection:"}</T> {order.rejectionReason}
            </p>
          )}
          {order.cancellationReason && (
            <p className="notice">
              <T>{"Cancellation:"}</T> {order.cancellationReason}
            </p>
          )}
        </div>
      </div>
      <div className="order-actions">
        {manage && (
          <>
            {next && (
              <Form
                schema={z.object({ reason: z.string().max(1000).optional() })}
                defaults={{ reason: "" }}
                fields={
                  user.role === "admin"
                    ? [{ name: "reason", label: "Administrative reason" }]
                    : []
                }
                submitLabel={t(`Mark ${label(next)}`)}
                onSubmit={(values) => action(next, values.reason)}
              />
            )}{" "}
            {order.orderStatus === "READY_FOR_PICKUP" && (
              <Form
                schema={z.object({
                  code: z
                    .string()
                    .regex(/^\d{6}$/, "Enter the customer’s six-digit code."),
                  reason: z.string().max(1000).optional(),
                })}
                defaults={{ code: "", reason: "" }}
                fields={[
                  { name: "code", label: "Pickup verification code" },
                  ...(user.role === "admin"
                    ? [{ name: "reason", label: "Administrative reason" }]
                    : []),
                ]}
                submitLabel="Verify pickup & complete"
                onSubmit={async (values) => {
                  await api.post(`/orders/${order._id}/verify-pickup`, values);
                  cache.invalidateQueries();
                  notify("Pickup verified and order completed.");
                }}
              />
            )}{" "}
            {[
              "PENDING",
              "ACCEPTED",
              "PREPARING",
              "READY_FOR_PICKUP",
              "OUT_FOR_DELIVERY",
            ].includes(order.orderStatus) && (
              <Form
                schema={z.object({
                  reason: z.string().trim().min(3).max(1000),
                })}
                defaults={{ reason: "" }}
                fields={[
                  {
                    name: "reason",
                    label:
                      order.orderStatus === "PENDING"
                        ? "Reason for rejection"
                        : "Cancellation reason",
                  },
                ]}
                submitLabel={
                  order.orderStatus === "PENDING"
                    ? "Reject order"
                    : "Cancel order"
                }
                onSubmit={(values) =>
                  action(
                    order.orderStatus === "PENDING" ? "REJECTED" : "CANCELLED",
                    values.reason,
                  )
                }
              />
            )}
          </>
        )}
        {!manage &&
          user.role === "customer" &&
          order.orderStatus === "PENDING" && (
            <Form
              schema={z.object({ reason: z.string().trim().min(3).max(1000) })}
              defaults={{ reason: "" }}
              fields={[{ name: "reason", label: "Cancellation reason" }]}
              submitLabel="Cancel pending order"
              onSubmit={(values) => action("CANCELLED", values.reason)}
            />
          )}
      </div>
      {!manage && user.role === "customer" && (
        <Button
          className="secondary"
          busy={reorderBusy}
          onClick={async () => {
            setReorderBusy(true);
            try {
              if (cart.items.length) {
                notify(
                  "Clear your current basket before repeating this order.",
                );
                return;
              }
              const shopId =
                typeof order.shopId === "object"
                  ? order.shopId._id
                  : order.shopId;
              const shopResponse = await api.get(`/shops/by-id/${shopId}`);
              const shop = shopResponse.data.shop;
              if (!shop) {
                notify("This store is unavailable.");
                return;
              }
              const products = await Promise.allSettled(
                order.items.map((item) =>
                  api.get(`/products/${item.productId}`),
                ),
              );
              let count = 0;
              order.items.forEach((item, index) => {
                const product =
                  products[index].status === "fulfilled"
                    ? products[index].value.data.product
                    : null;
                if (
                  product?.active &&
                  product.availabilityStatus !== "OUT_OF_STOCK" &&
                  (!product.inventoryTrackingEnabled ||
                    product.stockQuantity >= item.quantity)
                ) {
                  add(product, shop, item.quantity);
                  count++;
                }
              });
              notify(
                count
                  ? "Available products added at current prices. Review your basket."
                  : "These products are no longer available.",
              );
              if (count) navigate("/cart");
            } catch {
              notify("Could not repeat the order. Please visit the store.");
            } finally {
              setReorderBusy(false);
            }
          }}
        >
          <T>{"Repeat available items"}</T>
        </Button>
      )}
      <details className="hours">
        <summary>
          <T>{"Status history"}</T>
        </summary>
        {order.statusHistory.map((entry, index) => (
          <p key={index}>
            {dateTime(entry.at)} · {t(label(entry.status))}
            {entry.reason && ` · ${entry.reason}`}
          </p>
        ))}
      </details>
      {manage && user.role === "admin" && (
        <div className="panel">
          <h3>Record dispute resolution</h3>
          <Form
            schema={z.object({
              resolution: z.string().trim().min(5).max(2000),
            })}
            defaults={{ resolution: "" }}
            fields={[
              {
                name: "resolution",
                label: "Resolution notes",
                type: "textarea",
                wide: true,
              },
            ]}
            submitLabel="Record in audit trail"
            onSubmit={async (values) => {
              await api.post(`/admin/orders/${order._id}/dispute`, values);
              cache.invalidateQueries();
              notify("Dispute resolution recorded in the audit trail.");
            }}
          />
        </div>
      )}
    </div>
  );
}
export function Notifications() {
  const { t } = useLanguage();
  const query = useData("notifications", "/notifications?limit=50", {
    refetchInterval: 20000,
  });
  const cache = useQueryClient();
  const { notify } = useCommerce();
  const seen = useRef(new Set());
  const initialized = useRef(false);
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("lc-browser-notifications") === "yes",
  );
  useEffect(() => {
    if (!query.data) return;
    for (const item of query.data.items) {
      if (
        initialized.current &&
        !seen.current.has(item._id) &&
        !item.read &&
        enabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("LocalCart", {
            body: notificationText(item, t),
            tag: item._id,
          });
        } catch {}
      }
      seen.current.add(item._id);
    }
    initialized.current = true;
  }, [query.data, enabled, t]);
  return (
    <section className="container market-page">
      <PageHeading eyebrow="Stay in the loop" title={t("Notifications")}>
        <Button
          className="secondary"
          onClick={async () => {
            if (!("Notification" in window)) {
              notify(
                "This browser does not support notifications. Updates remain available here.",
              );
              return;
            }
            const permission = await Notification.requestPermission();
            const allow = permission === "granted";
            setEnabled(allow);
            localStorage.setItem(
              "lc-browser-notifications",
              allow ? "yes" : "no",
            );
            notify(
              allow
                ? "Browser notifications enabled while this page is open. Delivery is not guaranteed."
                : "Notifications remain available in your inbox.",
            );
          }}
        >
          <T>{"Enable browser notifications"}</T>
        </Button>
      </PageHeading>
      <p className="muted">
        <T>
          {
            "Order updates and requested item availability are saved here and checked regularly, even when live updates are unavailable."
          }
        </T>
      </p>
      <QueryState query={query} empty={query.data?.items.length === 0}>
        {query.data?.items.map((item) => (
          <div
            className={`panel notification ${item.read ? "read" : ""}`}
            key={item._id}
          >
            <div>
              {item.type === "PRODUCT_AVAILABLE" &&
              item.shopSlug &&
              item.productId ? (
                <Link
                  to={`/shop/${encodeURIComponent(item.shopSlug)}?product=${item.productId}`}
                >
                  {notificationText(item, t)} <T>{"View item"}</T>
                </Link>
              ) : item.type === "BOOKING_UPDATE" ? (
                <Link to="/bookings">{notificationText(item, t)}</Link>
              ) : item.orderId ? (
                <Link to={`/orders/${item.orderId}`}>
                  {notificationText(item, t)}
                </Link>
              ) : (
                <p>{item.message}</p>
              )}
              <small>{dateTime(item.createdAt)}</small>
            </div>
            {!item.read && (
              <Button
                className="secondary"
                onClick={async () => {
                  await api.patch(`/notifications/${item._id}/read`);
                  cache.invalidateQueries();
                }}
              >
                <T>{"Mark read"}</T>
              </Button>
            )}
          </div>
        ))}
      </QueryState>
    </section>
  );
}
