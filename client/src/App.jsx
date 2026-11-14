import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Layout } from "./layouts/Layout";
import { Home } from "./pages/customer/Home";
import { Shops, SearchProducts } from "./pages/customer/Shops";
import { AuthPage } from "./pages/customer/AuthPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loading } from "./components/UI";
const load = (file, name) =>
  lazy(() => file().then((module) => ({ default: module[name] })));
const Account = load(() => import("./pages/customer/Account"), "Account");
const Storefront = load(
  () => import("./pages/customer/Storefront"),
  "Storefront",
);
const Cart = load(() => import("./pages/customer/Cart"), "Cart");
const Checkout = load(() => import("./pages/customer/Cart"), "Checkout");
const Orders = load(() => import("./pages/customer/Orders"), "Orders");
const OrderDetail = load(
  () => import("./pages/customer/Orders"),
  "OrderDetail",
);
const Notifications = load(
  () => import("./pages/customer/Orders"),
  "Notifications",
);
const Application = load(
  () => import("./pages/shopkeeper/Application"),
  "Application",
);
const DashboardLayout = load(
  () => import("./layouts/DashboardLayout"),
  "DashboardLayout",
);
const ShopOverview = load(
  () => import("./pages/shopkeeper/ShopPages"),
  "ShopOverview",
);
const Categories = load(
  () => import("./pages/shopkeeper/ShopPages"),
  "Categories",
);
const ShopSettings = load(
  () => import("./pages/shopkeeper/ShopPages"),
  "ShopSettings",
);
const ProductRequests = load(
  () => import("./pages/shopkeeper/ShopPages"),
  "ProductRequests",
);
const Products = load(() => import("./pages/shopkeeper/Products"), "Products");
const IncomingOrders = load(
  () => import("./pages/shopkeeper/IncomingOrders"),
  "IncomingOrders",
);
const adminPage = (name) =>
  load(() => import("./pages/admin/AdminPages"), name);
const Classes = load(() => import("./pages/customer/Bookings"), "Classes");
const MyBookings = load(
  () => import("./pages/customer/Bookings"),
  "MyBookings",
);
const ServiceBookings = load(
  () => import("./pages/shopkeeper/ServiceBookings"),
  "ServiceBookings",
);
const AdminOverview = adminPage("AdminOverview"),
  AdminShops = adminPage("AdminShops"),
  AdminShopLayout = adminPage("AdminShopLayout"),
  AdminShopReview = adminPage("AdminShopReview"),
  AdminOrders = adminPage("AdminOrders"),
  AdminProducts = adminPage("AdminProducts"),
  AdminUsers = adminPage("AdminUsers"),
  AdminCatalog = adminPage("AdminCatalog"),
  AdminSubscriptions = adminPage("AdminSubscriptions"),
  AdminAudit = adminPage("AdminAudit"),
  AdminSettings = adminPage("AdminSettings");
const Info = load(() => import("./pages/customer/Info"), "Info");
const AdminSecurity = adminPage("AdminSecurity");
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<AuthPage key="login" />} />
            <Route
              path="register"
              element={<AuthPage key="register" register />}
            />
            <Route path="shops" element={<Shops />} />
            <Route path="classes" element={<Classes />} />
            <Route
              path="barbers"
              element={<Shops key="barbers" businessType="BARBER" />}
            />
            <Route path="search" element={<SearchProducts />} />
            <Route path="shop/:slug" element={<Storefront />} />
            <Route path="cart" element={<Cart />} />
            <Route path="apply" element={<Application />} />
            {["about", "support", "privacy", "terms"].map((page) => (
              <Route key={page} path={page} element={<Info page={page} />} />
            ))}
            <Route element={<ProtectedRoute />}>
              <Route path="account" element={<Account />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>
            <Route element={<ProtectedRoute role="customer" />}>
              <Route path="orders" element={<Orders />} />
              <Route path="bookings" element={<MyBookings />} />
              <Route path="checkout" element={<Checkout />} />
            </Route>
            <Route element={<ProtectedRoute role="shopkeeper" />}>
              <Route path="shopkeeper" element={<DashboardLayout />}>
                <Route index element={<ShopOverview />} />
                <Route path="orders" element={<IncomingOrders />} />
                <Route path="bookings" element={<ServiceBookings />} />
                <Route
                  path="past-orders"
                  element={<IncomingOrders key="past" past />}
                />
                <Route path="products" element={<Products />} />
                <Route path="categories" element={<Categories />} />
                <Route path="requests" element={<ProductRequests />} />
                <Route path="settings" element={<ShopSettings />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute role="admin" />}>
              <Route path="admin" element={<DashboardLayout admin />}>
                <Route index element={<AdminOverview />} />
                <Route path="shops" element={<AdminShops />} />
                <Route path="shops/:shopId" element={<AdminShopLayout />}>
                  <Route index element={<AdminShopReview />} />
                  <Route path="products" element={<Products />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="settings" element={<ShopSettings />} />
                </Route>
                <Route path="orders" element={<AdminOrders />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="catalog" element={<AdminCatalog />} />
                <Route path="subscriptions" element={<AdminSubscriptions />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="security" element={<AdminSecurity />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>
            <Route
              path="*"
              element={
                <section className="container account">
                  <h1>Page not found</h1>
                  <Link className="button" to="/">
                    Back to LocalCart
                  </Link>
                </section>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
