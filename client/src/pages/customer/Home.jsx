import { T } from "../../i18n/LanguageContext";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShoppingBasket,
  Store,
  HeartHandshake,
  MapPin,
  Check,
  Leaf,
} from "lucide-react";
import { Shops } from "./Shops";
import { useData } from "../../components/MarketUI";
export function Home() {
  const settings = useData("public-settings", "/settings");
  return (
    <>
      {settings.data?.notice && (
        <div className="platform-notice">{settings.data.notice}</div>
      )}
      <section className="container hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span />
            <T>{"A little closer to your neighborhood"}</T>
          </div>
          <h1>
            <T>{"Your favorite"}</T>
            <br />
            <T>{"local stores."}</T>
            <br />
            <em>
              <T>{"Now, online."}</T>
            </em>
          </h1>
          <p>
            <T>
              {
                "Browse nearby shops, check what’s listed, and order ahead. The shops you know. The people you trust. Your everyday, made easier."
              }
            </T>
          </p>
          <div className="hero-actions">
            <Link className="button" to="/shops">
              <T>{"Explore nearby stores"}</T> <ArrowRight size={18} />
            </Link>
            <Link className="text-link" to="/about">
              <T>{"See how it works"}</T>
            </Link>
          </div>
          <div className="hero-note">
            <HeartHandshake size={19} />
            <T>{"Small shops. Stronger communities."}</T>
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Illustration of a neighborhood grocery shop"
        >
          <div className="art-label">
            <MapPin size={15} />
            <T>{"Good things are closer than you think"}</T>
          </div>
          <div className="shop-illustration">
            <div className="shop-roof">
              <T>{"YOUR NEIGHBORHOOD STORE"}</T>
            </div>
            <div className="awning">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <div className="shop-front">
              <div className="shop-window">
                <span>🍋 🥬 🍅</span>
                <div>
                  <T>{"FRESH & LOCAL"}</T>
                </div>
                <span>🥕 🍎 🥑</span>
              </div>
              <div className="shop-door">
                <span>
                  <T>{"OPEN"}</T>
                </span>
                <i />
              </div>
            </div>
            <div className="shop-step" />
          </div>
          <div className="art-badge">
            <span>
              <Check size={20} />
            </span>
            <div>
              <strong>
                <T>{"Familiar faces. Fresh possibilities."}</T>
              </strong>
              <small>
                <T>{"Support the stores around you."}</T>
              </small>
            </div>
          </div>
          <div className="art-leaf">
            <Leaf size={32} />
          </div>
        </div>
      </section>
      <section className="container browse-categories">
        <span className="eyebrow">
          <T>{"A little of everything, close by"}</T>
        </span>
        <div>
          {[
            ["Groceries", "🛒"],
            ["Dairy", "🥛"],
            ["Vegetables", "🥬"],
            ["Stationery", "✏️"],
            ["Household", "🧹"],
            ["Toys", "🧸"],
          ].map(([category, icon]) => (
            <Link
              key={category}
              to={`/shops?category=${encodeURIComponent(category)}`}
            >
              <span aria-hidden="true">{icon}</span>
              <strong>
                <T>{category}</T>
              </strong>
            </Link>
          ))}
        </div>
      </section>
      <Shops preview />
      <section className="container service-discovery">
        <Link className="panel service-discovery-card" to="/classes">
          <span aria-hidden="true">◷</span>
          <div>
            <h2>
              <T>{"Classes"}</T>
            </h2>
            <p>
              <T>{"Teaching, gym and yoga · Live online sessions"}</T>
            </p>
            <strong>
              <T>{"Explore classes"}</T> →
            </strong>
          </div>
        </Link>
        <Link className="panel service-discovery-card" to="/barbers">
          <span aria-hidden="true">✂</span>
          <div>
            <h2>
              <T>{"Barber appointments"}</T>
            </h2>
            <p>
              <T>{"Join from home. Track your turn live."}</T>
            </p>
            <strong>
              <T>{"Find a barber"}</T> →
            </strong>
          </div>
        </Link>
      </section>
      <section className="benefits">
        <div className="container benefit-grid">
          {[
            [
              Store,
              "Your local favorites",
              "Discover independent stores in your neighborhood.",
            ],
            [
              ShoppingBasket,
              "Less waiting, more living",
              "Order ahead. Collect when your shop says it is ready.",
            ],
            [
              HeartHandshake,
              "Every order stays local",
              "Help small businesses grow, one basket at a time.",
            ],
          ].map(([Icon, title, text]) => (
            <article key={title}>
              <span className="feature-icon">
                <Icon />
              </span>
              <div>
                <h2>
                  <T>{title}</T>
                </h2>
                <p>
                  <T>{text}</T>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="container welcome">
        <div>
          <span className="eyebrow">
            <T>{"A better way to shop nearby"}</T>
          </span>
          <h2>
            <T>{"A big idea for"}</T>
            <br />
            <T>{"the little shops we love."}</T>
          </h2>
          <Link className="text-link" to="/apply">
            <T>{"Bring your shop online →"}</T>
          </Link>
        </div>
        <div>
          <p>
            <T>
              {
                "LocalCart connects you with existing neighborhood shops. No warehouses. Just local businesses, ready for a digital future."
              }
            </T>
          </p>
          <div className="launch-note">
            <Store size={22} />
            <span>
              <T>{"Pickup or available home delivery."}</T>
              <br />
              <strong>
                <T>
                  {"Shops confirm availability before preparing your order."}
                </T>
              </strong>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
