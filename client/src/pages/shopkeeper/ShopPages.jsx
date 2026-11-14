import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useOutletContext, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { z } from "zod";
import QRCode from "qrcode";
import { api } from "../../services/api";
import {
  useData,
  useAction,
  QueryState,
  PageHeading,
  Form,
  Metric,
  Pagination,
} from "../../components/MarketUI";
import { Button } from "../../components/UI";
import { ImageUpload } from "../../components/ImageUpload";
import { money } from "../../utils/format";
import { useCommerce } from "../../context/CommerceContext";
import { ServiceBookings } from "./ServiceBookings";
export function useShop() {
  return useOutletContext().shop;
}
export function ShopOverview() {
  const { t } = useLanguage();
  const shop = useShop();
  const query = useData(
    ["shop-analytics", shop._id],
    `/shops/${shop._id}/analytics`,
    {
      refetchInterval: 30000,
      enabled: !shop.businessType || shop.businessType === "RETAIL",
    },
  );
  if (shop.businessType === "CLASSES" || shop.businessType === "BARBER")
    return <ServiceBookings shop={shop} />;
  return (
    <>
      <PageHeading
        eyebrow="Your business at a glance"
        title={t("A good day to grow.")}
      />
      <QueryState query={query}>
        {query.data && (
          <>
            <div className="metric-grid">
              {[
                ["Today’s orders", query.data.todaysOrders],
                ["Pending orders", query.data.pendingOrders],
                ["Completed orders", query.data.completedOrders],
                ["Today’s completed sales", money(query.data.todaysSales)],
                ["Listed products", query.data.products],
                ["Low-stock products", query.data.lowStock],
              ].map(([name, value]) => (
                <Metric
                  key={name}
                  name={name}
                  value={value}
                  tone={name === "Pending orders" ? "danger" : undefined}
                />
              ))}
            </div>
            <div className="two-panels">
              <div className="panel">
                <h2>
                  <T>{"Sales trend"}</T>
                </h2>
                <p className="muted">
                  <T>
                    {
                      "Completed item sales in India time. Cancelled and rejected orders are excluded."
                    }
                  </T>
                </p>
                <div className="bar-chart">
                  {query.data.trend.length ? (
                    query.data.trend.map((point) => (
                      <div key={point._id}>
                        <span>{point._id.slice(5)}</span>
                        <i
                          style={{
                            width: `${Math.max(3, (point.sales / Math.max(...query.data.trend.map((p) => p.sales))) * 100)}%`,
                          }}
                        />
                        <strong>{money(point.sales)}</strong>
                      </div>
                    ))
                  ) : (
                    <p>
                      <T>{"No completed sales yet."}</T>
                    </p>
                  )}
                </div>
              </div>
              <div className="panel">
                <h2>
                  <T>{"Popular products"}</T>
                </h2>
                {query.data.popular.map((item) => (
                  <div className="total-row" key={item._id}>
                    <span>{item.name}</span>
                    <strong>
                      {item.quantity} <T>{"sold"}</T>
                    </strong>
                  </div>
                ))}
                <p className="muted">
                  <T>{"Completion rate:"}</T> {query.data.completionRate}%
                </p>
              </div>
            </div>
          </>
        )}
      </QueryState>
      <ShareStore shop={shop} />
    </>
  );
}
export function ShareStore({ shop }) {
  const [qr, setQr] = useState("");
  const url = `${window.location.origin}/shop/${shop.slug}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQr);
  }, [url]);
  return (
    <div className="panel share-store">
      <div>
        <h2>
          <T>{"Your shop, a link away."}</T>
        </h2>
        <p className="muted">
          <T>
            {
              "Share your storefront with customers or print the QR code for your counter."
            }
          </T>
        </p>
        <a
          className="text-link break-all"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {url}
        </a>
        <div className="row-actions">
          <a
            className="button secondary"
            href={`https://wa.me/?text=${encodeURIComponent(`Shop at ${shop.name}: ${url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <T>{"Share on WhatsApp"}</T>
          </a>
          {qr && (
            <a className="text-link" href={qr} download={`${shop.slug}-qr.png`}>
              <T>{"Download QR code"}</T>
            </a>
          )}
        </div>
      </div>
      {qr && (
        <img
          width="150"
          height="150"
          src={qr}
          alt={`QR code for ${shop.name}`}
        />
      )}
    </div>
  );
}
const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  displayOrder: z.number().int().min(0).max(10000),
  active: z.enum(["true", "false"]),
});
export function Categories() {
  const { t } = useLanguage();
  const shop = useShop();
  const [edit, setEdit] = useState(null);
  const [page, setPage] = useState(1);
  const query = useData(
    ["manage-categories", shop._id, page],
    `/manage/shops/${shop._id}/categories?page=${page}`,
  );
  const action = useAction();
  return (
    <>
      <PageHeading
        eyebrow="Keep your shelves organized"
        title={t("Product categories")}
      />
      <div className="two-panels">
        <div className="panel">
          <h2>
            <T>{edit ? "Edit category" : "Add category"}</T>
          </h2>
          <Form
            key={edit?._id || "new"}
            schema={categorySchema}
            defaults={
              edit
                ? {
                    name: edit.name,
                    displayOrder: edit.displayOrder,
                    active: String(edit.active),
                  }
                : { name: "", displayOrder: 0, active: "true" }
            }
            fields={[
              { name: "name", label: "Category name" },
              {
                name: "displayOrder",
                label: "Display order",
                type: "number",
                help: "Lower numbers appear first.",
              },
              {
                name: "active",
                label: "Visible in store",
                type: "select",
                options: [
                  { value: "true", label: "Yes" },
                  { value: "false", label: "No" },
                ],
              },
            ]}
            onSubmit={async (values, reset) => {
              await action.mutateAsync({
                method: edit ? "patch" : "post",
                url: edit
                  ? `/categories/${edit._id}`
                  : `/shops/${shop._id}/categories`,
                data: { ...values, active: values.active === "true" },
              });
              setEdit(null);
              reset({ name: "", displayOrder: 0, active: "true" });
            }}
          />
          {edit && (
            <Button className="secondary" onClick={() => setEdit(null)}>
              <T>{"Cancel editing"}</T>
            </Button>
          )}
        </div>
        <div className="panel">
          <QueryState query={query} empty={query.data?.items.length === 0}>
            {query.data?.items.map((category) => (
              <div className="list-row" key={category._id}>
                <div>
                  <strong>{category.name}</strong>
                  <small>
                    <T>{"Order"}</T> {category.displayOrder} ·{" "}
                    {category.active ? "Active" : "Hidden"}
                  </small>
                </div>
                <div className="row-actions">
                  <Button
                    className="secondary"
                    onClick={() => setEdit(category)}
                  >
                    <T>{"Edit"}</T>
                  </Button>
                  <Button
                    className="secondary"
                    busy={action.isPending}
                    onClick={() =>
                      action.mutate({
                        method: "delete",
                        url: `/categories/${category._id}`,
                      })
                    }
                  >
                    <T>{"Archive"}</T>
                  </Button>
                </div>
              </div>
            ))}
          </QueryState>
          <Pagination data={query.data} page={page} setPage={setPage} />
        </div>
      </div>
    </>
  );
}
const settingsSchema = z.object({
  businessType: z.enum(["RETAIL", "CLASSES", "BARBER"]),
  name: z.string().min(2).max(300),
  category: z.string().min(2).max(300),
  description: z.string().max(2000),
  address: z.string().min(3).max(300),
  city: z.string().min(2).max(300),
  neighborhood: z.string().min(2).max(300),
  pinCode: z.string().regex(/^[1-9]\d{5}$/),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  preparationMinutes: z.number().int().min(5).max(1440),
  pickupEnabled: z.enum(["true", "false"]),
  temporarilyClosed: z.enum(["true", "false"]),
});
export function ShopSettings() {
  const { t } = useLanguage();
  const shop = useShop();
  const action = useAction();
  return (
    <>
      <PageHeading
        eyebrow="A storefront that feels like you"
        title={t("Store settings")}
      />
      <div className="panel">
        <h2>
          <T>{"Store photo"}</T>
        </h2>
        <ImageUpload type="shop" id={shop._id} image={shop.image} />
        <Form
          schema={settingsSchema}
          defaults={{
            ...shop,
            businessType: shop.businessType || "RETAIL",
            pickupEnabled: String(shop.pickupEnabled),
            temporarilyClosed: String(shop.temporarilyClosed),
          }}
          fields={[
            { name: "name", label: "Shop name" },
            {
              name: "businessType",
              label: "Business type",
              type: "select",
              options: [
                { value: "RETAIL", label: "Retail shop" },
                { value: "CLASSES", label: "Classes · Teaching, gym and yoga" },
                { value: "BARBER", label: "Barber · Appointment queue" },
              ],
            },
            { name: "category", label: "Store category" },
            {
              name: "description",
              label: "Description",
              type: "textarea",
              wide: true,
            },
            { name: "phone", label: "Contact mobile" },
            { name: "address", label: "Street address", wide: true },
            { name: "city", label: "City" },
            { name: "neighborhood", label: "Neighborhood" },
            { name: "pinCode", label: "PIN code" },
            {
              name: "preparationMinutes",
              label: "Pickup preparation estimate (minutes)",
              type: "number",
            },
            {
              name: "pickupEnabled",
              label: "Pickup",
              type: "select",
              options: [
                { value: "true", label: "Enabled" },
                { value: "false", label: "Disabled" },
              ],
            },
            {
              name: "temporarilyClosed",
              label: "Accepting orders",
              type: "select",
              options: [
                { value: "false", label: "Open according to schedule" },
                { value: "true", label: "Temporarily closed" },
              ],
            },
          ]}
          onSubmit={(values) =>
            action.mutateAsync({
              method: "patch",
              url: `/shops/${shop._id}`,
              data: {
                ...values,
                pickupEnabled: values.pickupEnabled === "true",
                temporarilyClosed: values.temporarilyClosed === "true",
              },
            })
          }
        />
      </div>
      <OpeningHours shop={shop} />
      <Coordinates shop={shop} />
      <ShareStore shop={shop} />
      <div className="panel">
        <h2>
          <T>{"Delivery"}</T>
        </h2>
        <p>
          {shop.deliveryEnabled
            ? `Enabled · ${money(shop.deliverySettings.deliveryFee)} fee · minimum ${money(shop.deliverySettings.minimumOrderAmount)}`
            : "Delivery is not enabled. Contact the administrator to request delivery."}
        </p>
        <p className="muted">
          <T>
            {
              "Delivery permissions, fees and service areas are managed by the platform administrator."
            }
          </T>
        </p>
      </div>
    </>
  );
}
function OpeningHours({ shop }) {
  const action = useAction();
  const [hours, setHours] = useState(
    shop.openingHours.length
      ? shop.openingHours.map((h) => ({ ...h }))
      : Array.from({ length: 7 }, (_, day) => ({
          day,
          open: "09:00",
          close: "21:00",
          closed: false,
        })),
  );
  return (
    <div className="panel">
      <h2>
        <T>{"Opening hours · India time"}</T>
      </h2>
      <p className="muted">
        <T>
          {
            "Set every day, then save the schedule. Overnight hours are supported."
          }
        </T>
      </p>
      {hours.map((hour, index) => (
        <div className="hours-row" key={hour.day}>
          <strong>
            {
              [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ][hour.day]
            }
          </strong>
          <input
            aria-label={`${hour.day} opening time`}
            type="time"
            value={hour.open}
            onChange={(e) =>
              setHours(
                hours.map((h, i) =>
                  i === index ? { ...h, open: e.target.value } : h,
                ),
              )
            }
          />
          <span>
            <T>{"to"}</T>
          </span>
          <input
            aria-label={`${hour.day} closing time`}
            type="time"
            value={hour.close}
            onChange={(e) =>
              setHours(
                hours.map((h, i) =>
                  i === index ? { ...h, close: e.target.value } : h,
                ),
              )
            }
          />
          <label>
            <input
              type="checkbox"
              checked={hour.closed}
              onChange={(e) =>
                setHours(
                  hours.map((h, i) =>
                    i === index ? { ...h, closed: e.target.checked } : h,
                  ),
                )
              }
            />{" "}
            <T>{"Closed"}</T>
          </label>
        </div>
      ))}
      <Button
        busy={action.isPending}
        onClick={() =>
          action.mutate({
            method: "patch",
            url: `/shops/${shop._id}`,
            data: {
              openingHours: hours.map(({ day, open, close, closed }) => ({
                day,
                open,
                close,
                closed,
              })),
            },
          })
        }
      >
        <T>{"Save opening hours"}</T>
      </Button>
    </div>
  );
}
function Coordinates({ shop }) {
  const action = useAction();
  const { notify } = useCommerce();
  return (
    <div className="panel">
      <h2>
        <T>{"Approximate store location"}</T>
      </h2>
      <p className="muted">
        Optional. Helps nearby customers see approximate straight-line distance.
        Delivery eligibility uses configured PIN codes.
      </p>
      <Button
        className="secondary"
        onClick={() => {
          if (!navigator.geolocation)
            return notify("Geolocation is unavailable.");
          navigator.geolocation.getCurrentPosition(
            (position) =>
              action.mutate({
                method: "patch",
                url: `/shops/${shop._id}`,
                data: {
                  coordinates: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  },
                },
              }),
            () =>
              notify("Location unavailable. Try again while at your store."),
            { timeout: 10000 },
          );
        }}
      >
        <T>{"Use my location for this store"}</T>
      </Button>
    </div>
  );
}
export function ProductRequests() {
  const { t } = useLanguage();
  const shop = useShop();
  const query = useData(
    ["product-requests", shop._id],
    `/shops/${shop._id}/requests?limit=100`,
    { refetchInterval: 15000 },
  );
  const action = useAction();
  return (
    <>
      <PageHeading
        eyebrow="Listen to your neighborhood"
        title={t("Product requests")}
      />
      <QueryState query={query} empty={query.data?.items.length === 0}>
        {query.data?.items.map((item) => (
          <div className="panel list-row" key={item._id}>
            <div>
              <p>{item.message}</p>
              <small>
                <T>
                  {item.resolved
                    ? item.availableProductId
                      ? "Available — customer notified"
                      : "Closed"
                    : "Open request"}
                </T>
              </small>
            </div>
            <div className="row-actions">
              {!item.resolved && (
                <RequestAvailability item={item} shop={shop} />
              )}
              <Button
                className="secondary"
                busy={action.isPending}
                onClick={() =>
                  action.mutate({
                    method: "patch",
                    url: `/requests/${item._id}`,
                    data: { resolved: !item.resolved },
                  })
                }
              >
                <T>{item.resolved ? "Reopen" : "Close request"}</T>
              </Button>
            </div>
          </div>
        ))}
      </QueryState>
    </>
  );
}
function RequestAvailability({ item, shop }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState("");
  const action = useAction();
  const products = useData(
    ["request-products", shop._id, search, page],
    `/manage/shops/${shop._id}/products?${new URLSearchParams({ search, page, limit: 20 })}`,
    { enabled: open },
  );
  const available =
    products.data?.items.filter(
      (product) =>
        product.active &&
        product.availabilityStatus === "AVAILABLE" &&
        (!product.inventoryTrackingEnabled || product.stockQuantity > 0),
    ) || [];
  return (
    <div>
      <Button className="secondary" onClick={() => setOpen(!open)}>
        <T>{open ? "Cancel" : "Now available"}</T>
      </Button>
      {open && (
        <div className="market-form">
          <p>
            <T>
              {
                "Select the item to notify the customer with a product link. Closing a request sends no availability notification."
              }
            </T>
          </p>
          <input
            aria-label={t("Search available products")}
            placeholder={t("Search products")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setProductId("");
            }}
          />
          <QueryState query={products}>
            <select
              aria-label={t("Available product")}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">
                <T>{"Select an available product"}</T>
              </option>
              {available.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name}
                </option>
              ))}
            </select>
            {!available.length && (
              <p>
                <T>
                  {
                    "No available products on this page. Update your product stock or try another search or page."
                  }
                </T>
              </p>
            )}
            <Pagination
              data={products.data}
              page={page}
              setPage={(next) => {
                setPage(next);
                setProductId("");
              }}
            />
          </QueryState>
          <Button
            disabled={!productId || products.isFetching}
            busy={action.isPending}
            onClick={() =>
              action.mutate({
                method: "patch",
                url: `/requests/${item._id}`,
                data: { resolved: true, productId },
              })
            }
          >
            <T>{"Notify customer"}</T>
          </Button>
        </div>
      )}
    </div>
  );
}
