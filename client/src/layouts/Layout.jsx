import { T } from "../i18n/LanguageContext";
import { useLanguage } from "../i18n/LanguageContext";
import { Link, Outlet } from "react-router-dom";
import { ShoppingBasket, ArrowUpRight, Bell, Store } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCommerce } from "../context/CommerceContext";
import { LocationPicker } from "../components/LocationPicker";
import { useLiveOrders } from "../hooks/useLiveOrders";
import { SignInPrompt } from "../components/SignInPrompt";
import { useData } from "../components/MarketUI";
import { LanguageSelector } from "../components/LanguageSelector";
export function Layout() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { cart } = useCommerce();
  const unread = useData(
    ["unread-notifications", user?.id],
    "/notifications?read=false&limit=1",
    {
      enabled: !!user,
      refetchInterval: 15000,
    },
  );
  const unreadCount = unread.data?.total || 0;
  useLiveOrders();
  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link className="brand" to="/">
            <span className="brand-icon">
              <ShoppingBasket size={24} />
            </span>
            LocalCart<span className="brand-dot">.</span>
          </Link>
          <div className="header-location">
            <LocationPicker />
          </div>
          <nav aria-label="Main navigation">
            <LanguageSelector />
            <Link to="/shops" className="quiet-link">
              <T>{"Explore stores"}</T>
            </Link>
            <Link
              to={
                user?.role === "shopkeeper"
                  ? "/shopkeeper"
                  : user?.role === "admin"
                    ? "/admin"
                    : "/apply"
              }
              className="quiet-link"
            >
              <T>
                {user?.role === "shopkeeper" || user?.role === "admin"
                  ? "Dashboard"
                  : "For shopkeepers"}
              </T>
            </Link>
            {user && (
              <Link
                to="/notifications"
                className="cart-nav"
                aria-label={
                  unreadCount
                    ? t("Notifications, {count} unread", { count: unreadCount })
                    : t("Notifications")
                }
              >
                <Bell size={19} />
                {unreadCount > 0 && <span>{unreadCount}</span>}
              </Link>
            )}
            <Link
              to="/cart"
              className="cart-nav"
              aria-label={t("Basket with {count} products", {
                count: cart.items.length,
              })}
            >
              <ShoppingBasket size={20} />
              {cart.items.length > 0 && <span>{cart.items.length}</span>}
            </Link>
            <Link className="nav-account" to={user ? "/account" : "/login"}>
              <T>{user ? "My account" : "Sign in"}</T>{" "}
              <ArrowUpRight size={16} />
            </Link>
          </nav>
        </div>
      </header>
      <nav className="service-nav" aria-label={t("Explore LocalCart")}>
        <Link to="/shops">{t("Stores")}</Link>
        <Link to="/classes">{t("Classes")}</Link>
        <Link to="/barbers">{t("Barber appointments")}</Link>
        {user?.role === "customer" && (
          <Link to="/bookings">{t("My bookings")}</Link>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
      <SignInPrompt />
      <footer className="container footer">
        <div>
          <Link className="brand small" to="/">
            LocalCart.
          </Link>
          <p>
            <T>{"Your Neighborhood. Your Stores. Online."}</T>
          </p>
        </div>
        <div className="footer-links">
          <Link to="/about">
            <T>{"About"}</T>
          </Link>
          <Link to="/support">
            <T>{"Support"}</T>
          </Link>
          <Link to="/privacy">
            <T>{"Privacy"}</T>
          </Link>
          <Link to="/terms">
            <T>{"Terms"}</T>
          </Link>
        </div>
        <span>
          <T>{"Made for local communities in India."}</T>
        </span>
      </footer>
      <div className="mobile-nav">
        <Link to="/shops">
          <Store size={18} />
          <T>{"Stores"}</T>
        </Link>
        <Link to="/search">
          <T>{"Search"}</T>
        </Link>
        <Link to="/cart">
          <ShoppingBasket size={18} />
          <T>{"Basket"}</T>
        </Link>
        <Link to={user ? "/account" : "/login"}>
          <T>{"Account"}</T>
        </Link>
      </div>
    </>
  );
}
