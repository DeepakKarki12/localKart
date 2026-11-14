import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Store, ArrowRight, MapPin } from "lucide-react";
import { useCommerce } from "../../context/CommerceContext";
import {
  useData,
  Image,
  Pagination,
  QueryState,
  PageHeading,
} from "../../components/MarketUI";
import { LocationPicker } from "../../components/LocationPicker";
import { shopOpen, distanceKm, money } from "../../utils/format";
export function ShopCard({ shop, coordinates }) {
  const status = shopOpen(shop);
  const distance = distanceKm(coordinates, shop.coordinates);
  return (
    <Link className="store-card" to={`/shop/${shop.slug}`}>
      <div className="store-cover">
        <Image image={shop.image} alt={shop.name} />
        <span className={`store-open ${status.open ? "" : "closed"}`}>
          <T>{status.text}</T>
        </span>
      </div>
      <div className="store-copy">
        <small>{shop.category}</small>
        <h2>{shop.name}</h2>
        <p>
          <MapPin size={13} />
          {shop.neighborhood}, {shop.city}
          {distance != null && ` · approx. ${distance.toFixed(1)} km`}
        </p>
        <div className="store-tags">
          {(!shop.businessType || shop.businessType === "RETAIL") &&
            shop.pickupEnabled && (
              <span>
                <T>{"Pickup"}</T>
              </span>
            )}
          {(!shop.businessType || shop.businessType === "RETAIL") &&
            shop.deliveryEnabled && (
              <span>
                <T>{"Delivery"}</T>
              </span>
            )}
          <span>
            {shop.businessType === "CLASSES" ? (
              <T>{"Online classes"}</T>
            ) : shop.businessType === "BARBER" ? (
              <T>{"Barber appointments"}</T>
            ) : (
              <>
                <T>{"Prep estimate:"}</T> {shop.preparationMinutes}{" "}
                <T>{"min"}</T>
              </>
            )}
          </span>
        </div>
        <div className="store-bottom">
          <T>{"Visit your neighborhood store"}</T> <ArrowRight size={17} />
        </div>
      </div>
    </Link>
  );
}
export function Shops({ preview = false, businessType }) {
  const { t } = useLanguage();
  const { location } = useCommerce();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [routeParams] = useSearchParams();
  const params = new URLSearchParams({
    ...(businessType ? { businessType } : {}),
    page,
    limit: preview ? 3 : 12,
    ...(location.pinCode
      ? { pinCode: location.pinCode }
      : location.city
        ? { city: location.city }
        : {}),
    ...(location.neighborhood ? { neighborhood: location.neighborhood } : {}),
    ...(search ? { search } : {}),
    ...(routeParams.get("category")
      ? { category: routeParams.get("category") }
      : {}),
  });
  const query = useData(["shops", params.toString()], `/shops?${params}`);
  return (
    <section
      className={preview ? "container home-stores" : "container market-page"}
    >
      {preview ? (
        <div className="section-title">
          <div>
            <span className="eyebrow">
              <T>{"Shop closer to home"}</T>
            </span>
            <h2>
              <T>{"Your neighborhood favorites"}</T>
            </h2>
          </div>
          <Link className="text-link" to="/shops">
            <T>{"Explore all stores"}</T> <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <>
          <PageHeading
            eyebrow="Independent shops. Everyday essentials."
            title={t(
              businessType === "BARBER"
                ? "Find a barber"
                : "Good things, nearby.",
            )}
          >
            <LocationPicker />
          </PageHeading>
          <div className="search-bar">
            <Store size={20} />
            <input
              aria-label={t("Search stores")}
              placeholder={t("Search neighborhood stores…")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Link to="/search">
              <T>{"Search products instead →"}</T>
            </Link>
          </div>
          <p className="muted">
            <T>
              {
                "Only approved participating stores are listed. Preparation times are store estimates, subject to confirmation."
              }
            </T>
          </p>
        </>
      )}
      <QueryState query={query}>
        {query.data?.items?.length ? (
          <div className="store-grid">
            {query.data.items.map((shop) => (
              <ShopCard
                key={shop._id}
                shop={shop}
                coordinates={location.coordinates}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Store size={36} />
            <h3>
              <T>{"No participating stores here yet"}</T>
            </h3>
            <p>
              <T>
                {
                  "Try another city or PIN code. Local shopkeepers can apply to join."
                }
              </T>
            </p>
            <Link className="button secondary" to="/apply">
              <T>{"Bring your store online"}</T>
            </Link>
          </div>
        )}
      </QueryState>
      {!preview && (
        <Pagination data={query.data} page={page} setPage={setPage} />
      )}
    </section>
  );
}
export function SearchProducts() {
  const { t } = useLanguage();
  const { location } = useCommerce();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    page,
    search,
    ...(location.pinCode
      ? { pinCode: location.pinCode }
      : location.city
        ? { city: location.city }
        : {}),
  });
  const query = useData(
    ["product-search", params.toString()],
    `/products/search?${params}`,
    { enabled: search.trim().length >= 2 },
  );
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Find it around the corner"
        title={t("One search. Local options.")}
      >
        <LocationPicker />
      </PageHeading>
      <input
        className="search-input"
        value={search}
        placeholder={t("Search milk, rice, stationery…")}
        aria-label={t("Search products across stores")}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {search.length < 2 ? (
        <div className="empty">
          <T>
            {
              "Enter at least two characters to search nearby participating shops."
            }
          </T>
        </div>
      ) : (
        <QueryState query={query} empty={query.data?.items.length === 0}>
          <div className="product-grid">
            {query.data?.items.map((product) => (
              <Link
                className="product-card"
                key={product._id}
                to={`/shop/${product.shopId.slug}?product=${product._id}`}
              >
                <Image
                  image={product.image || product.catalogId?.image}
                  alt={product.name}
                />
                <small>{product.shopId.name}</small>
                <h3>{product.name}</h3>
                <p>{product.unit}</p>
                <strong>{money(product.price)}</strong>
              </Link>
            ))}
          </div>
          <Pagination data={query.data} page={page} setPage={setPage} />
        </QueryState>
      )}
    </section>
  );
}
