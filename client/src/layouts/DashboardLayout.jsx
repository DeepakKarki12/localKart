import { T } from "../i18n/LanguageContext";
import { useLanguage } from "../i18n/LanguageContext";
import { NavLink, Outlet, Link, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ListTree,
  ClipboardList,
  Settings,
  Store,
  Users,
  Receipt,
  ShieldCheck,
  Bell,
  MessageSquare,
  CalendarDays,
  Scissors,
} from "lucide-react";
import { useData, QueryState, Status } from "../components/MarketUI";
import { ImageUpload } from "../components/ImageUpload";
import { useAuth } from "../context/AuthContext";
export function DashboardLayout({ admin = false }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const shop = useData("my-shop", "/shops/mine", {
    enabled: !admin,
    refetchInterval: 30000,
  });
  const shopId = shop.data?.shop?._id;
  const countsEnabled =
    !admin &&
    !!shopId &&
    shop.data.shop.approvalStatus === "APPROVED" &&
    shop.data.shop.active;
  const retail =
    !shop.data?.shop?.businessType || shop.data.shop.businessType === "RETAIL";
  const pendingOrders = useData(
    ["sidebar-pending-orders", shopId],
    `/shops/${shopId}/orders?status=PENDING&limit=1`,
    { enabled: countsEnabled && retail, refetchInterval: 15000 },
  );
  const productRequests = useData(
    ["sidebar-product-requests", shopId],
    `/shops/${shopId}/requests?resolved=false&limit=1`,
    { enabled: countsEnabled && retail, refetchInterval: 15000 },
  );
  const counts = countsEnabled
    ? {
        orders: pendingOrders.data?.total || 0,
        requests: productRequests.data?.total || 0,
      }
    : {};
  const links = admin
    ? [
        ["", "Overview", LayoutDashboard],
        ["shops", "Stores & approvals", Store],
        ["orders", "All orders", ClipboardList],
        ["products", "All products", Package],
        ["users", "Users", Users],
        ["catalog", "Shared image catalog", Package],
        ["subscriptions", "Subscriptions", Receipt],
        ["audit", "Audit trail", ShieldCheck],
        ["security", "Security activity", ShieldCheck],
        ["settings", "Platform settings", Settings],
      ]
    : !retail
      ? [
          ["", "Overview", LayoutDashboard],
          [
            "bookings",
            shop.data?.shop?.businessType === "BARBER"
              ? "Live barber queue"
              : "Manage classes",
            shop.data?.shop?.businessType === "BARBER"
              ? Scissors
              : CalendarDays,
          ],
          ["settings", "Store settings", Settings],
        ]
      : [
          ["", "Overview", LayoutDashboard],
          ["orders", "Incoming orders", ClipboardList],
          ["past-orders", "Past orders", Receipt],
          ["products", "Products", Package],
          ["categories", "Categories", ListTree],
          ["requests", "Product requests", MessageSquare],
          ["settings", "Store settings", Settings],
        ];
  const prefix = admin ? "/admin" : "/shopkeeper";
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <div>
          <small>
            {t(admin ? "PLATFORM WORKSPACE" : "YOUR BUSINESS, ONLINE")}
          </small>
          <h2>
            {admin ? "LocalCart Admin" : shop.data?.shop?.name || t("My store")}
          </h2>
          <span>{user.name}</span>
        </div>
        <nav aria-label="Dashboard navigation">
          {links.map(([path, title, Icon]) => (
            <NavLink
              end={path === ""}
              key={path}
              to={`${prefix}${path ? `/${path}` : ""}`}
            >
              <Icon size={18} />
              {t(title)}
              {counts[path] > 0 && (
                <span
                  className="sidebar-count"
                  aria-label={`${counts[path]} ${path === "orders" ? "pending orders" : "unresolved product requests"}`}
                >
                  {counts[path]}
                </span>
              )}
            </NavLink>
          ))}
          <Link to="/notifications">
            <Bell size={18} />
            <T>{"Notifications"}</T>
          </Link>
          <Link to="/shops">
            <Store size={18} />
            <T>{"Customer website"}</T>
          </Link>
        </nav>
      </aside>
      <div className="dashboard-content">
        {admin ? (
          <Outlet />
        ) : (
          <QueryState query={shop}>
            {shop.data?.shop &&
              (shop.data.shop.approvalStatus === "APPROVED" &&
              shop.data.shop.active ? (
                <Outlet context={{ shop: shop.data.shop }} />
              ) : (
                <div className="panel application-status">
                  <span className="eyebrow">
                    <T>{"Application status"}</T>
                  </span>
                  <h1>
                    <T>{"Your store’s next chapter."}</T>
                  </h1>
                  <Status value={shop.data.shop.approvalStatus} />
                  <p>
                    <T>
                      {
                        "Your storefront appears publicly only after our team verifies and approves your application."
                      }
                    </T>
                  </p>
                  {shop.data.shop.rejectionReason && (
                    <p className="notice">{shop.data.shop.rejectionReason}</p>
                  )}
                  <h2>{shop.data.shop.name}</h2>
                  <p>
                    {shop.data.shop.address}, {shop.data.shop.city} –{" "}
                    {shop.data.shop.pinCode}
                  </p>
                  <ImageUpload
                    type="shop"
                    id={shop.data.shop._id}
                    image={shop.data.shop.image}
                  />
                  <Link className="text-link" to="/support">
                    <T>{"Contact support"}</T>
                  </Link>
                </div>
              ))}
          </QueryState>
        )}
      </div>
    </div>
  );
}
