import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { Link, useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { quantityLimit } from "../../utils/stock";
import { z } from "zod";
import { useCommerce } from "../../context/CommerceContext";
import { useAuth } from "../../context/AuthContext";
import { Button, Notice } from "../../components/UI";
import {
  PageHeading,
  QueryState,
  Form,
  useData,
} from "../../components/MarketUI";
import { money } from "../../utils/format";
import { api, errorMessage } from "../../services/api";
export function Cart() {
  const { cart, quantity, clear, syncStock, notify } = useCommerce();
  const ids = cart.items
    .map((item) => item.productId)
    .sort()
    .join(",");
  const stock = useData(
    ["cart-stock", cart.shopId, ids],
    `/shops/${cart.shopId}/products?${new URLSearchParams({ ids, limit: 100 })}`,
    {
      enabled: !!ids,
      staleTime: 0,
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
    },
  );
  useEffect(() => {
    if (!stock.data) return;
    const byId = new Map(stock.data.items.map((p) => [p._id, p]));
    if (
      cart.items.some(
        (item) => item.quantity > quantityLimit(byId.get(item.productId)),
      )
    )
      notify(
        "Your basket was adjusted to match the currently available stock.",
      );
    syncStock(stock.data.items);
  }, [stock.data, cart.items, syncStock, notify]);
  return (
    <section className="container market-page">
      <PageHeading eyebrow="A basket full of local" title="Your basket" />
      {!cart.items.length ? (
        <div className="empty">
          <h2>
            <T>{"Your basket is waiting"}</T>
          </h2>
          <p>
            <T>{"Find everyday favorites at a store near you."}</T>
          </p>
          <Link className="button" to="/shops">
            <T>{"Explore stores"}</T>
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="panel">
            <h2>{cart.shopName}</h2>
            <p className="muted">
              <T>
                {
                  "One store per basket. Clear your basket before switching stores."
                }
              </T>
            </p>
            <Notice>{stock.error && errorMessage(stock.error)}</Notice>
            {cart.items.map((item) => (
              <div className="cart-item" key={item.productId}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.unit} · {money(item.price)} <T>{"listed price"}</T>
                  </p>
                  {item.maxQuantity != null && item.maxQuantity < 100 && (
                    <small>
                      <T>{"Maximum available:"}</T> {item.maxQuantity}
                    </small>
                  )}
                </div>
                <div className="quantity">
                  <button
                    aria-label={`Decrease ${item.name}`}
                    onClick={() => quantity(item.productId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    aria-label={`Increase ${item.name}`}
                    disabled={
                      stock.isPending ||
                      !!stock.error ||
                      item.quantity >= (item.maxQuantity ?? 100)
                    }
                    onClick={() => quantity(item.productId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <strong>{money(item.price * item.quantity)}</strong>
              </div>
            ))}
            <div className="row-actions">
              <Link className="text-link" to={`/shop/${cart.slug}`}>
                <T>{"Continue shopping"}</T>
              </Link>
              <Button className="secondary" onClick={clear}>
                <T>{"Clear basket"}</T>
              </Button>
            </div>
          </div>
          <aside className="panel">
            <h2>
              <T>{"Basket estimate"}</T>
            </h2>
            <div className="total-row">
              <span>
                <T>{"Items"}</T>
              </span>
              <strong>
                {money(
                  cart.items.reduce(
                    (sum, item) => sum + item.price * item.quantity,
                    0,
                  ),
                )}
              </strong>
            </div>
            <p className="muted">
              <T>
                {
                  "Current prices, stock and any delivery fee are checked by the server before purchase."
                }
              </T>
            </p>
            {stock.isPending || stock.error ? (
              <Button disabled>
                <T>{"Check availability before purchase"}</T>
              </Button>
            ) : (
              <Link className="button" to="/checkout">
                <T>{"Continue to purchase →"}</T>
              </Link>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
const schema = z
  .object({
    customerName: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid mobile number."),
    fulfillmentMethod: z.enum(["pickup", "delivery"]),
    line: z.string().max(300),
    city: z.string().max(100),
    pinCode: z.string().max(6),
    deliveryWindow: z.string(),
    notes: z.string().max(1000),
  })
  .refine(
    (v) =>
      v.fulfillmentMethod !== "delivery" ||
      (v.line.length >= 3 &&
        v.city.length >= 2 &&
        /^[1-9]\d{5}$/.test(v.pinCode) &&
        v.deliveryWindow),
    {
      path: ["line"],
      message: "Delivery needs a full address, valid PIN and delivery window.",
    },
  );
export function Checkout() {
  const { t } = useLanguage();
  const { cart } = useCommerce();
  const shop = useData(["shop", cart.slug], `/shops/${cart.slug}`, {
    enabled: !!cart.items.length,
  });
  if (!cart.items.length) return <Cart />;
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Almost at your neighborhood shop"
        title={t("Complete your purchase")}
      />
      <QueryState query={shop}>
        {shop.data && <CheckoutForm shop={shop.data.shop} />}
      </QueryState>
    </section>
  );
}
function CheckoutForm({ shop }) {
  const { user } = useAuth();
  const { cart, clear, notify } = useCommerce();
  const [quote, setQuote] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const address = user.addresses?.[0];
  const fields = [
    { name: "customerName", label: "Customer name" },
    { name: "phone", label: "Mobile number", type: "tel" },
    {
      name: "fulfillmentMethod",
      label: "Pickup or delivery",
      type: "select",
      options: [
        ...(shop.pickupEnabled
          ? [{ value: "pickup", label: "Pickup · pay at store" }]
          : []),
        ...(shop.deliveryEnabled
          ? [{ value: "delivery", label: "Delivery · cash on delivery" }]
          : []),
      ],
    },
    {
      name: "notes",
      label: "Order notes (optional)",
      type: "textarea",
      wide: true,
    },
  ];
  if (shop.deliveryEnabled)
    fields.push(
      {
        name: "line",
        label: "Delivery address",
        wide: true,
        help: "Required only for delivery. Your first saved address is filled below.",
      },
      { name: "city", label: "Delivery city" },
      { name: "pinCode", label: "Delivery PIN" },
      {
        name: "deliveryWindow",
        label: "Delivery window",
        type: "select",
        options: [
          { value: "", label: "Choose for delivery" },
          ...shop.deliverySettings.deliveryTimeSlots.map((s) => ({
            value: s,
            label: s,
          })),
        ],
      },
    );
  async function review(values) {
    const { line, city, pinCode, ...rest } = values;
    const payload = {
      ...rest,
      shopId: shop._id,
      items: cart.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      paymentMethod:
        values.fulfillmentMethod === "delivery"
          ? "CASH_ON_DELIVERY"
          : "PAY_AT_STORE",
      ...(values.fulfillmentMethod === "delivery"
        ? { deliveryAddress: { label: "Delivery", line, city, pinCode } }
        : {}),
    };
    const response = await api.post("/orders/quote", payload);
    setQuote({ ...response.data.quote, payload });
  }
  return (
    <div className="cart-layout">
      <div className="panel">
        <h2>
          <T>{"Order details"}</T>
        </h2>
        <Notice>{error}</Notice>
        <div onChange={() => setQuote(null)}>
          <Form
            schema={schema}
            defaults={{
              customerName: user.name,
              phone: user.phone,
              fulfillmentMethod: shop.pickupEnabled ? "pickup" : "delivery",
              line: address?.line || "",
              city: address?.city || "",
              pinCode: address?.pinCode || "",
              deliveryWindow: "",
              notes: "",
            }}
            fields={fields}
            onSubmit={review}
            submitLabel="Review current prices"
          />
        </div>
        <p className="muted">
          <T>
            {
              "Online payments: Coming Soon. The shopkeeper must confirm availability before preparing your order."
            }
          </T>
        </p>
      </div>
      <aside className="panel">
        <h2>{shop.name}</h2>
        {shop.deliveryEnabled && (
          <p className="muted">
            <T>{"Delivery minimum:"}</T>{" "}
            {money(shop.deliverySettings.minimumOrderAmount)}. Serviceable PINs:{" "}
            {shop.deliverySettings.serviceablePinCodes.join(", ")}. Windows are
            shop estimates.
          </p>
        )}
        {quote ? (
          <>
            <h3>
              <T>{"Server-confirmed quote"}</T>
            </h3>
            {quote.items.map((i) => (
              <div className="total-row" key={i.productId}>
                <span>
                  {i.quantity} × {i.name}
                </span>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            <div className="total-row">
              <span>
                <T>{"Subtotal"}</T>
              </span>
              <span>{money(quote.subtotal)}</span>
            </div>
            <div className="total-row">
              <span>
                <T>{"Delivery"}</T>
              </span>
              <span>{money(quote.deliveryFee)}</span>
            </div>
            <div className="total-row grand">
              <span>
                <T>{"Total payable"}</T>
              </span>
              <strong>{money(quote.totalAmount)}</strong>
            </div>
            <p className="muted">
              This quote uses the details you last reviewed. Review again after
              changing details. Availability and prices are rechecked on
              submission.
            </p>
            <Button
              busy={pending}
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  const { data } = await api.post(
                    "/orders",
                    {
                      ...quote.payload,
                      expectedTotalAmount: quote.totalAmount,
                    },
                    {
                      headers: { "Idempotency-Key": key.current },
                    },
                  );
                  clear();
                  notify(
                    "Order submitted. Waiting for the shopkeeper to confirm.",
                  );
                  navigate(`/orders/${data.order._id}`);
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setPending(false);
                }
              }}
            >
              <T>{"Submit order ·"}</T> {money(quote.totalAmount)}
            </Button>
          </>
        ) : (
          <p className="muted">
            <T>
              {
                "Fill in your details and review current prices to get a server-calculated total."
              }
            </T>
          </p>
        )}
      </aside>
    </div>
  );
}
