import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useState, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapPin, Phone, Share2, Plus, ShoppingBasket, X } from "lucide-react";
import {
  useData,
  Image,
  QueryState,
  Pagination,
  Status,
} from "../../components/MarketUI";
import { Button, Notice } from "../../components/UI";
import { useCommerce } from "../../context/CommerceContext";
import { useAuth } from "../../context/AuthContext";
import { money, shopOpen } from "../../utils/format";
import { Form } from "../../components/MarketUI";
import { z } from "zod";
import { api } from "../../services/api";
import { Dialog } from "../../components/Dialog";
import { quantityLimit } from "../../utils/stock";
import { ServiceStore } from "./Bookings";
export function Storefront() {
  const { slug } = useParams();
  const query = useData(["shop", slug], `/shops/${slug}`);
  return (
    <section className="container market-page">
      <QueryState query={query}>
        {query.data &&
          (query.data.shop.businessType === "CLASSES" ||
          query.data.shop.businessType === "BARBER" ? (
            <ServiceStore key={query.data.shop._id} shop={query.data.shop} />
          ) : (
            <Store shop={query.data.shop} />
          ))}
      </QueryState>
    </section>
  );
}
function Store({ shop }) {
  const { t } = useLanguage();
  const { cart, add, notify } = useCommerce();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [params, setParams] = useSearchParams();
  const directProduct = useData(
    ["product-detail", params.get("product")],
    `/products/${params.get("product")}`,
    { enabled: !!params.get("product"), retry: false },
  );
  const categories = useData(
    ["categories", shop._id],
    `/shops/${shop._id}/categories?limit=100`,
  );
  const products = useData(
    ["products", shop._id, search, category, page],
    `/shops/${shop._id}/products?${new URLSearchParams({ search, page, ...(category ? { categoryId: category } : {}) })}`,
  );
  useEffect(() => {
    const product = directProduct.data?.product;
    if (product && String(product.shopId) === shop._id) setSelected(product);
  }, [directProduct.data, shop._id]);
  const status = shopOpen(shop);
  const remaining = selected
    ? Math.max(
        0,
        quantityLimit(selected) -
          (cart.items.find((item) => item.productId === selected._id)
            ?.quantity || 0),
      )
    : 0;
  const blockedReason = (product) =>
    !status.open
      ? "Store closed"
      : product.availabilityStatus === "OUT_OF_STOCK" ||
          (product.inventoryTrackingEnabled && product.stockQuantity <= 0)
        ? "Out of stock"
        : null;
  async function share(product) {
    const url = `${window.location.origin}/shop/${shop.slug}${product ? `?product=${product._id}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: product?.name || shop.name, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        notify("Link copied. Share it on WhatsApp or Instagram.");
      } catch {
        notify(url);
      }
    }
  }
  return (
    <>
      <div className="store-hero">
        <Image image={shop.image} alt={shop.name} detail />
        <div>
          <span className="eyebrow">{shop.category}</span>
          <h1>{shop.name}</h1>
          <p>{shop.description}</p>
          <p>
            <MapPin size={15} />
            {shop.address}, {shop.neighborhood}, {shop.city} – {shop.pinCode}
          </p>
          <a href={`tel:${shop.phone}`}>
            <Phone size={15} />
            {shop.phone}
          </a>
          <div className="store-tags">
            <span>
              <T>{status.text}</T>
            </span>
            {shop.pickupEnabled && (
              <span>
                <T>{"Pickup · estimated prep"}</T> {shop.preparationMinutes}{" "}
                <T>{"min"}</T>
              </span>
            )}
            <span>
              {shop.deliveryEnabled
                ? `Delivery from ${money(shop.deliverySettings.deliveryFee)}`
                : "Pickup only"}
            </span>
          </div>
          <button
            className="text-link inline-flex gap-2"
            onClick={() => share()}
          >
            <Share2 size={16} />
            <T>{"Share store"}</T>
          </button>
        </div>
      </div>
      {shop.openingHours.length > 0 && (
        <details className="hours">
          <summary>
            <T>{"Opening hours (India time)"}</T>
          </summary>
          <div>
            {shop.openingHours.map((h) => (
              <p key={h.day}>
                {
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][h.day]
                }
                : {h.closed ? "Closed" : `${h.open} – ${h.close}`}
              </p>
            ))}
          </div>
        </details>
      )}
      <div className="store-toolbar">
        <input
          className="search-input"
          aria-label={t("Search this store")}
          placeholder={t("Search in this store…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={t("Filter category")}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            <T>{"All categories"}</T>
          </option>
          {categories.data?.items.map((c) => (
            <option value={c._id} key={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <QueryState query={products} empty={products.data?.items.length === 0}>
        <div className="product-grid">
          {products.data?.items.map((product) => (
            <article className="product-card" key={product._id}>
              <button
                className="product-photo"
                onClick={() => {
                  setSelected(product);
                  setQuantity(1);
                }}
                aria-label={`View ${product.name}`}
              >
                <Image
                  image={product.image || product.catalogId?.image}
                  alt={product.name}
                />
              </button>
              <small>{product.unit}</small>
              <button
                className="product-title"
                onClick={() => {
                  setSelected(product);
                  setQuantity(1);
                }}
              >
                {product.name}
              </button>
              <span
                className={`availability ${product.availabilityStatus === "OUT_OF_STOCK" ? "unavailable" : ""}`}
              >
                {product.inventoryTrackingEnabled && !product.stockQuantity
                  ? "Out of stock"
                  : product.availabilityStatus === "CONFIRM_AVAILABILITY"
                    ? "Shop will confirm availability"
                    : product.availabilityStatus === "OUT_OF_STOCK"
                      ? "Out of stock"
                      : "Available"}
              </span>
              <div className="product-price">
                <strong>{money(product.price)}</strong>
                {product.mrp > product.price && <del>{money(product.mrp)}</del>}
                <Button
                  disabled={!!user && !!blockedReason(product)}
                  className="secondary"
                  onClick={() => add(product, shop)}
                >
                  {user && blockedReason(product) ? (
                    blockedReason(product)
                  ) : (
                    <>
                      <Plus size={15} />
                      <T>{"Add"}</T>
                    </>
                  )}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <Pagination data={products.data} page={page} setPage={setPage} />
      </QueryState>
      <div className="request-box">
        <h2>
          <T>{"Can’t find what you need?"}</T>
        </h2>
        {user?.role === "customer" ? (
          <Form
            schema={z.object({ message: z.string().trim().min(3).max(500) })}
            defaults={{ message: "" }}
            fields={[
              {
                name: "message",
                label: "Request a product",
                placeholder: "Tell the shopkeeper what you’re looking for",
                wide: true,
              },
            ]}
            submitLabel="Send request"
            onSubmit={async (values, reset) => {
              await api.post("/requests", { shopId: shop._id, ...values });
              notify("Your request was sent to the shopkeeper.");
              reset();
            }}
          />
        ) : (
          <Link className="text-link" to="/login">
            <T>{"Sign in to send a product request"}</T>
          </Link>
        )}
      </div>
      {cart.items.length > 0 && (
        <Link className="sticky-cart" to="/cart">
          <ShoppingBasket size={20} />
          {cart.items.reduce((n, i) => n + i.quantity, 0)} items from{" "}
          {cart.shopName}
          <span>
            <T>{"View basket →"}</T>
          </span>
        </Link>
      )}
      {selected && (
        <Dialog
          label={selected.name}
          onClose={() => {
            setSelected(null);
            setParams({});
          }}
        >
          <button
            className="modal-close"
            aria-label={t("Close product")}
            onClick={() => {
              setSelected(null);
              setParams({});
            }}
          >
            <X />
          </button>
          <Image
            detail
            image={selected.image || selected.catalogId?.image}
            alt={selected.name}
          />
          <h2>{selected.name}</h2>
          <p>
            {selected.description ||
              "Ask the shopkeeper for more product information."}
          </p>
          <p>
            {
              categories.data?.items.find((c) => c._id === selected.categoryId)
                ?.name
            }{" "}
            · {selected.unit}
          </p>
          <Status value={selected.availabilityStatus} />
          <h3>{money(selected.price)}</h3>
          <label>
            <T>{"Quantity"}</T>{" "}
            <input
              type="number"
              aria-label={t("Product quantity")}
              min="1"
              max={remaining}
              disabled={!remaining}
              value={remaining ? Math.min(quantity, remaining) : 0}
              onChange={(e) =>
                setQuantity(
                  Math.max(
                    1,
                    Math.min(
                      remaining,
                      Math.trunc(Number(e.target.value)) || 1,
                    ),
                  ),
                )
              }
            />
          </label>
          <p>
            {remaining
              ? `You can add up to ${remaining} more to your basket.`
              : "No more of this product can be added to your basket."}
          </p>
          <Button
            disabled={!!user && (!!blockedReason(selected) || !remaining)}
            onClick={() => add(selected, shop, Math.min(quantity, remaining))}
          >
            {user && blockedReason(selected)
              ? blockedReason(selected)
              : user && !remaining
                ? "Maximum quantity in basket"
                : "Add to basket"}
          </Button>
          <Button className="secondary" onClick={() => share(selected)}>
            <Share2 size={16} />
            <T>{"Share product"}</T>
          </Button>
        </Dialog>
      )}
    </>
  );
}
