import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useState } from "react";
import { Link, Outlet, useParams, NavLink } from "react-router-dom";
import { z } from "zod";
import {
  useData,
  useAction,
  QueryState,
  PageHeading,
  Metric,
  Pagination,
  Status,
  Form,
  Image,
} from "../../components/MarketUI";
import { ImageUpload } from "../../components/ImageUpload";
import { Button } from "../../components/UI";
import { money, dateTime, rupeesToPaise } from "../../utils/format";
import { OrderPanel } from "../customer/Orders";
import { statuses } from "../shopkeeper/IncomingOrders";
export function AdminOverview() {
  const query = useData("admin-dashboard", "/admin/dashboard", {
    refetchInterval: 30000,
  });
  return (
    <>
      <PageHeading
        eyebrow="A stronger local economy, together"
        title="Platform overview"
      />
      <QueryState query={query}>
        {query.data && (
          <>
            <div className="metric-grid">
              {[
                ["Registered stores", query.data.stores],
                ["Active stores", query.data.activeStores],
                ["Pending approvals", query.data.pendingApprovals],
                ["Customers", query.data.customers],
                ["All orders", query.data.orders],
                ["Completed orders", query.data.completed],
                ["Completed merchandise value", money(query.data.gmv)],
                ["Earned platform fees", money(query.data.platformRevenue)],
              ].map(([name, value]) => (
                <Metric key={name} name={name} value={value} />
              ))}
            </div>
            <div className="panel">
              <h2>Revenue, clearly separated</h2>
              <p>
                Gross merchandise value is the value of items in completed
                orders. It belongs to participating shops. Platform revenue
                shows the platform fee earned on those completed orders; payment
                collection and settlement are managed outside LocalCart.
              </p>
              <p className="muted">
                Completed delivery fees: {money(query.data.deliveryFees)}.
                Active subscription amounts configured:{" "}
                {money(query.data.configuredSubscriptions)}. Subscription
                configuration does not record a payment or add revenue.
              </p>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
export function AdminShops() {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useData(
    ["admin-shops", status, search, page],
    `/admin/shops?${new URLSearchParams({ page, search, ...(status ? { status } : {}) })}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="The shops behind your marketplace"
        title="Stores & approvals"
      />
      <div className="store-toolbar">
        <input
          className="search-input"
          value={search}
          placeholder={t("Search stores")}
          aria-label={t("Search stores")}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Approval status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </div>
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((shop) => (
                <tr key={shop._id}>
                  <td>
                    <strong>{shop.name}</strong>
                    <small>{shop.category}</small>
                  </td>
                  <td>
                    {shop.ownerId?.name}
                    <small>{shop.ownerId?.email}</small>
                  </td>
                  <td>
                    {shop.city}
                    <small>{shop.pinCode}</small>
                  </td>
                  <td>
                    <Status value={shop.approvalStatus} />
                  </td>
                  <td>
                    <Link
                      className="button secondary"
                      to={`/admin/shops/${shop._id}`}
                    >
                      Review store
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminShopLayout() {
  const { shopId } = useParams();
  const query = useData(["admin-shop", shopId], `/admin/shops/${shopId}`);
  return (
    <QueryState query={query}>
      {query.data && (
        <>
          <PageHeading
            eyebrow="Store management"
            title={query.data.shop.name}
          />
          <div className="tab-nav">
            {[
              ["", "Review & delivery"],
              ["products", "Products"],
              ["categories", "Categories"],
              ["settings", "Store settings"],
            ].map(([path, title]) => (
              <NavLink
                end={!path}
                key={path}
                to={`/admin/shops/${shopId}${path ? `/${path}` : ""}`}
              >
                {title}
              </NavLink>
            ))}
          </div>
          <Outlet context={{ shop: query.data.shop }} />
        </>
      )}
    </QueryState>
  );
}
export function AdminShopReview() {
  const { shopId } = useParams();
  const query = useData(["admin-shop", shopId], `/admin/shops/${shopId}`);
  const action = useAction();
  const shop = query.data?.shop;
  if (!shop) return null;
  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>Application details</h2>
          <Status value={shop.approvalStatus} />
        </div>
        <dl className="detail-list">
          <dt>Owner</dt>
          <dd>
            {shop.ownerId?.name} · {shop.ownerId?.email} · {shop.ownerId?.phone}
          </dd>
          <dt>Shop contact</dt>
          <dd>{shop.phone}</dd>
          <dt>
            <T>{"Address"}</T>
          </dt>
          <dd>
            {shop.address}, {shop.neighborhood}, {shop.city} – {shop.pinCode}
          </dd>
          <dt>
            <T>{"Description"}</T>
          </dt>
          <dd>{shop.description}</dd>
          <dt>Business details</dt>
          <dd>{shop.businessDetails || "Not supplied"}</dd>
          <dt>Internal verification notes</dt>
          <dd>{shop.verificationNotes || "No notes recorded"}</dd>
        </dl>
        <Image image={shop.image} alt={shop.name} />
        <h3>Verification & approval</h3>
        <Form
          schema={z.object({
            status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
            notes: z.string().trim().min(3).max(2000),
            physicallyVerified: z.enum(["false", "true"]),
          })}
          defaults={{
            status: "APPROVED",
            notes: "",
            physicallyVerified: "false",
          }}
          fields={[
            {
              name: "status",
              label: "New store status",
              type: "select",
              options: [
                { value: "APPROVED", label: "Approve / reactivate" },
                { value: "REJECTED", label: "Reject application" },
                { value: "SUSPENDED", label: "Suspend / deactivate" },
              ],
            },
            {
              name: "physicallyVerified",
              label: "Physical verification completed?",
              type: "select",
              options: [
                { value: "false", label: "Not confirmed" },
                { value: "true", label: "Yes — verified in person" },
              ],
            },
            {
              name: "notes",
              label: "Internal verification notes / reason",
              type: "textarea",
              wide: true,
            },
          ]}
          submitLabel="Record decision"
          onSubmit={(v) =>
            action.mutateAsync({
              method: "patch",
              url: `/admin/shops/${shopId}/approval`,
              data: {
                ...v,
                physicallyVerified: v.physicallyVerified === "true",
              },
            })
          }
        />
      </div>
      <DeliveryForm shop={shop} />
      <SubscriptionForm shop={shop} />
    </>
  );
}
function DeliveryForm({ shop }) {
  const action = useAction();
  const settings = shop.deliverySettings || {};
  const schema = z.object({
    deliveryEnabled: z.enum(["true", "false"]),
    deliveryRadiusKm: z.number().min(0.1).max(100),
    deliveryFee: z.number().min(0).max(1000000),
    minimumOrderAmount: z.number().min(0).max(1000000),
    serviceablePinCodes: z.string().max(1000),
    deliveryTimeSlots: z.string().max(2000),
  });
  return (
    <div className="panel">
      <h2>Delivery configuration</h2>
      <p className="muted">
        PIN codes determine MVP eligibility. Radius is operational guidance for
        manually coordinated delivery; the purchase page does not claim
        route-distance validation.
      </p>
      <Form
        schema={schema}
        defaults={{
          deliveryEnabled: String(shop.deliveryEnabled),
          deliveryRadiusKm: settings.deliveryRadiusKm || 5,
          deliveryFee: (settings.deliveryFee || 0) / 100,
          minimumOrderAmount: (settings.minimumOrderAmount || 0) / 100,
          serviceablePinCodes: settings.serviceablePinCodes?.join(", ") || "",
          deliveryTimeSlots: settings.deliveryTimeSlots?.join("\n") || "",
        }}
        fields={[
          {
            name: "deliveryEnabled",
            label: "Home delivery",
            type: "select",
            options: [
              { value: "false", label: "Disabled — pickup only" },
              { value: "true", label: "Enabled" },
            ],
          },
          {
            name: "deliveryRadiusKm",
            label: "Operational radius (km)",
            type: "number",
            step: ".1",
          },
          {
            name: "deliveryFee",
            label: "Delivery fee (₹)",
            type: "number",
            step: ".01",
          },
          {
            name: "minimumOrderAmount",
            label: "Minimum item subtotal (₹)",
            type: "number",
            step: ".01",
          },
          {
            name: "serviceablePinCodes",
            label: "Serviceable PIN codes (comma separated)",
            wide: true,
          },
          {
            name: "deliveryTimeSlots",
            label: "Delivery window estimates (one per line)",
            type: "textarea",
            wide: true,
            help: "Use clear labels and keep dated windows current.",
          },
        ]}
        onSubmit={(v) =>
          action.mutateAsync({
            method: "patch",
            url: `/admin/shops/${shop._id}/delivery`,
            data: {
              ...v,
              deliveryEnabled: v.deliveryEnabled === "true",
              deliveryFee: rupeesToPaise(v.deliveryFee),
              minimumOrderAmount: rupeesToPaise(v.minimumOrderAmount),
              serviceablePinCodes: v.serviceablePinCodes
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              deliveryTimeSlots: v.deliveryTimeSlots
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          })
        }
      />
    </div>
  );
}
function SubscriptionForm({ shop }) {
  const action = useAction();
  const query = useData(
    ["shop-subscription", shop._id],
    `/admin/shops/${shop._id}/subscription`,
  );
  const current = query.data?.subscription;
  const inputDate = (value) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  return (
    <div className="panel">
      <h2>Manual subscription</h2>
      <p className="muted">
        Configure the shop’s plan. No automatic billing or paid gateway is
        connected.
      </p>
      <QueryState query={query}>
        {query.data && (
          <Form
            key={current?.updatedAt || "new"}
            schema={z.object({
              plan: z.string().min(1).max(100),
              amount: z.number().min(0),
              status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
              startDate: z.string().min(10),
              endDate: z.string().min(10),
            })}
            defaults={{
              plan: current?.plan || "Starter",
              amount: (current?.amount || 0) / 100,
              status: current?.status || "ACTIVE",
              startDate: current?.startDate
                ? inputDate(current.startDate)
                : inputDate(new Date()),
              endDate: current?.endDate ? inputDate(current.endDate) : "",
            }}
            fields={[
              { name: "plan", label: "Plan name" },
              {
                name: "amount",
                label: "Plan amount (₹)",
                type: "number",
                step: ".01",
              },
              {
                name: "status",
                label: "Subscription status",
                type: "select",
                options: ["ACTIVE", "EXPIRED", "CANCELLED"].map((v) => ({
                  value: v,
                  label: v,
                })),
              },
              { name: "startDate", label: "Start date", type: "date" },
              { name: "endDate", label: "End date", type: "date" },
            ]}
            onSubmit={(v) =>
              action.mutateAsync({
                method: "put",
                url: `/admin/shops/${shop._id}/subscription`,
                data: {
                  ...v,
                  amount: rupeesToPaise(v.amount),
                  startDate: new Date(
                    `${v.startDate}T00:00:00+05:30`,
                  ).toISOString(),
                  endDate: new Date(
                    `${v.endDate}T23:59:59+05:30`,
                  ).toISOString(),
                },
              })
            }
          />
        )}
      </QueryState>
    </div>
  );
}
export function AdminOrders() {
  const [status, setStatus] = useState("");
  const [shopId, setShopId] = useState("");
  const [page, setPage] = useState(1);
  const query = useData(
    ["admin-orders", status, shopId, page],
    `/admin/orders?${new URLSearchParams({ page, ...(status ? { status } : {}), ...(shopId ? { shopId } : {}) })}`,
    { refetchInterval: 20000 },
  );
  const shops = useData("admin-shop-options", "/admin/shops?limit=100");
  return (
    <>
      <PageHeading
        eyebrow="Platform-wide order visibility"
        title="All orders"
      />
      <div className="store-toolbar">
        <select
          aria-label="Order status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Order store"
          value={shopId}
          onChange={(e) => {
            setShopId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All stores</option>
          {shops.data?.items.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <p className="muted">
        Administrative status changes require a reason and are audited. Pickup
        completion still requires the customer’s code.
      </p>
      <QueryState query={query} empty={query.data?.items.length === 0}>
        {query.data?.items.map((order) => (
          <div key={order._id}>
            <p className="eyebrow">{order.shopId?.name}</p>
            <OrderPanel order={order} manage />
          </div>
        ))}
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminProducts() {
  const [shopId, setShopId] = useState("");
  const [page, setPage] = useState(1);
  const query = useData(
    ["admin-products", shopId, page],
    `/admin/products?${new URLSearchParams({ page, ...(shopId ? { shopId } : {}) })}`,
  );
  const shops = useData("admin-shop-options", "/admin/shops?limit=100");
  return (
    <>
      <PageHeading
        eyebrow="Every product belongs to a local shop"
        title="All products"
      />
      <select
        aria-label="Products by store"
        value={shopId}
        onChange={(e) => {
          setShopId(e.target.value);
          setPage(1);
        }}
      >
        <option value="">All stores</option>
        {shops.data?.items.map((s) => (
          <option value={s._id} key={s._id}>
            {s.name}
          </option>
        ))}
      </select>
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Product"}</T>
                </th>
                <th>Store</th>
                <th>
                  <T>{"Price"}</T>
                </th>
                <th>
                  <T>{"Availability"}</T>
                </th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div className="product-cell">
                      <Image
                        image={p.image || p.catalogId?.image}
                        alt={p.name}
                      />
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>{p.shopId?.name}</td>
                  <td>{money(p.price)}</td>
                  <td>
                    <Status value={p.availabilityStatus} />
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      to={`/admin/shops/${p.shopId?._id}/products`}
                    >
                      Manage in store
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminUsers() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null);
  const action = useAction();
  const query = useData(
    ["admin-users", role, search, page],
    `/admin/users?${new URLSearchParams({ page, search, ...(role ? { role } : {}) })}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="Keep your community trusted"
        title="User management"
      />
      <div className="store-toolbar">
        <input
          className="search-input"
          aria-label="Search users by email"
          value={search}
          placeholder="Search email addresses"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={role}
          aria-label="User role"
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All users</option>
          <option value="customer">Customers</option>
          <option value="shopkeeper">Shopkeepers</option>
        </select>
      </div>
      {edit && (
        <div className="panel">
          <h2>Manage {edit.name}</h2>
          <Form
            key={edit.id}
            schema={z.object({
              accountStatus: z.enum(["active", "suspended"]),
              reason: z.string().trim().min(3).max(1000),
            })}
            defaults={{ accountStatus: edit.accountStatus, reason: "" }}
            fields={[
              {
                name: "accountStatus",
                label: "Account status",
                type: "select",
                options: [
                  { value: "active", label: "Active" },
                  { value: "suspended", label: "Suspended" },
                ],
              },
              { name: "reason", label: "Reason", wide: true },
            ]}
            onSubmit={async (values) => {
              await action.mutateAsync({
                method: "patch",
                url: `/admin/users/${edit.id}/status`,
                data: values,
              });
              setEdit(null);
            }}
          />
          <Button className="secondary" onClick={() => setEdit(null)}>
            <T>{"Close"}</T>
          </Button>
        </div>
      )}
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>
                  <T>{"Phone"}</T>
                </th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    <small>{user.email}</small>
                  </td>
                  <td>{user.role}</td>
                  <td>{user.phone}</td>
                  <td>
                    <Status value={user.accountStatus} />
                  </td>
                  <td>
                    {user.role !== "admin" && (
                      <Button
                        className="secondary"
                        onClick={() => setEdit(user)}
                      >
                        Manage status
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
const catalogSchema = z.object({
  name: z.string().min(2).max(200),
  unit: z.string().min(1).max(100),
  description: z.string().max(2000),
  barcode: z.string().regex(/^$|^\d{8,14}$/, "Use 8–14 digits or leave blank."),
});
export function AdminCatalog() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null);
  const action = useAction();
  const query = useData(
    ["admin-catalog", search, page],
    `/catalog?${new URLSearchParams({ search, page })}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="One photo, many neighborhood shops"
        title="Shared product catalog"
      />
      <div className="panel">
        <h2>{edit ? "Edit catalog entry" : "Create catalog entry"}</h2>
        <p className="muted">
          Upload photos you have permission to use. Shopkeepers can reuse these
          entries and add their own overrides.
        </p>
        <Form
          key={edit?._id || "new"}
          schema={catalogSchema}
          defaults={
            edit
              ? {
                  name: edit.name,
                  unit: edit.unit,
                  description: edit.description || "",
                  barcode: edit.barcode || "",
                }
              : { name: "", unit: "1 pack", description: "", barcode: "" }
          }
          fields={[
            { name: "name", label: "Branded product name" },
            { name: "unit", label: "Unit / pack size" },
            { name: "barcode", label: "Barcode (optional)" },
            {
              name: "description",
              label: "Description",
              type: "textarea",
              wide: true,
            },
          ]}
          onSubmit={async (values) => {
            const data = { ...values };
            if (!data.barcode) delete data.barcode;
            await action.mutateAsync({
              method: edit ? "patch" : "post",
              url: edit ? `/admin/catalog/${edit._id}` : "/admin/catalog",
              data,
            });
            setEdit(null);
          }}
        />
        {edit && (
          <>
            <ImageUpload
              type="catalog"
              id={edit._id}
              image={query.data?.items.find((i) => i._id === edit._id)?.image}
            />
            <Button className="secondary" onClick={() => setEdit(null)}>
              <T>{"Cancel editing"}</T>
            </Button>
          </>
        )}
      </div>
      <input
        className="search-input"
        aria-label="Search shared catalog"
        placeholder="Search shared catalog"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="product-grid">
          {query.data?.items.map((item) => (
            <div className="product-card" key={item._id}>
              <Image image={item.image} alt={item.name} />
              <h3>{item.name}</h3>
              <p>{item.unit}</p>
              <small>{item.barcode || "No barcode"}</small>
              <Button className="secondary" onClick={() => setEdit(item)}>
                Edit & manage image
              </Button>
            </div>
          ))}
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminSubscriptions() {
  const [page, setPage] = useState(1);
  const query = useData(
    ["subscriptions", page],
    `/admin/subscriptions?page=${page}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="Simple, manually managed plans"
        title="Shop subscriptions"
      />
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((item) => (
                <tr key={item._id}>
                  <td>
                    <Link
                      className="text-link"
                      to={`/admin/shops/${item.shopId?._id}`}
                    >
                      {item.shopId?.name}
                    </Link>
                  </td>
                  <td>{item.plan}</td>
                  <td>{money(item.amount)}</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    {dateTime(item.startDate)}
                    <small>Until {dateTime(item.endDate)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminAudit() {
  const [page, setPage] = useState(1);
  const query = useData(["audit", page], `/admin/audit?page=${page}`);
  return (
    <>
      <PageHeading
        eyebrow="Accountability for every important change"
        title="Audit trail"
      />
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((item) => (
                <tr key={item._id}>
                  <td>{dateTime(item.createdAt)}</td>
                  <td>
                    {item.actorId?.name}
                    <small>{item.actorId?.email}</small>
                  </td>
                  <td>{item.action}</td>
                  <td>
                    {item.targetType}
                    <small>{item.targetId}</small>
                  </td>
                  <td>
                    <details>
                      <summary>View metadata</summary>
                      <pre>{JSON.stringify(item.metadata, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminSecurity() {
  const [page, setPage] = useState(1);
  const query = useData(
    ["security-events", page],
    `/admin/security?page=${page}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="Review repeated failed sign-ins"
        title="Security activity"
      />
      <p className="muted">
        Failed logins are retained for 30 days. Matching fingerprints indicate
        repeated email or IP values; raw attempted email addresses and IPs are
        not stored.
      </p>
      <QueryState query={query} empty={query.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Known account</th>
                <th>Email fingerprint</th>
                <th>IP fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((event) => (
                <tr key={event._id}>
                  <td>{dateTime(event.createdAt)}</td>
                  <td>{event.type}</td>
                  <td>{event.userId?.email || "Unknown account"}</td>
                  <td>{event.emailFingerprint}</td>
                  <td>{event.ipFingerprint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
export function AdminSettings() {
  const query = useData("platform-settings", "/admin/settings");
  const action = useAction();
  return (
    <>
      <PageHeading
        eyebrow="Your platform, thoughtfully configured"
        title="Platform settings"
      />
      <QueryState query={query}>
        {query.data && (
          <div className="panel">
            <Form
              schema={z.object({
                supportEmail: z.email(),
                platformFeeBps: z.number().int().min(0).max(3000),
                notice: z.string().max(500),
              })}
              defaults={query.data.settings}
              fields={[
                { name: "supportEmail", label: "Support email", type: "email" },
                {
                  name: "platformFeeBps",
                  label: "Platform fee in basis points",
                  type: "number",
                  help: "100 = 1%. Applied to new order merchandise subtotal. Collected/settled manually.",
                },
                {
                  name: "notice",
                  label: "Public platform notice",
                  type: "textarea",
                  wide: true,
                },
              ]}
              onSubmit={(data) =>
                action.mutateAsync({
                  method: "patch",
                  url: "/admin/settings",
                  data,
                })
              }
            />
          </div>
        )}
      </QueryState>
    </>
  );
}
