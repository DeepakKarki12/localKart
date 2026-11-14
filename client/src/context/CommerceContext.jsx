import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { quantityLimit } from "../utils/stock";
import { useAuth } from "./AuthContext";
import { z } from "zod";
import { T } from "../i18n/LanguageContext";
const Context = createContext(null);
const locationSchema = z.object({
  city: z.string().max(100),
  neighborhood: z.string().max(100),
  pinCode: z.string().regex(/^$|^[1-9]\d{5}$/),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});
const cartSchema = z
  .object({
    shopId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
    shopName: z.string().max(300).optional(),
    slug: z.string().max(400).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().regex(/^[a-f\d]{24}$/i),
          name: z.string().max(300),
          unit: z.string().max(300),
          price: z.number().int().min(0).max(100000000),
          quantity: z.number().int().min(1).max(100),
          maxQuantity: z.number().int().min(0).max(100).optional(),
        }),
      )
      .max(100),
  })
  .refine(
    (value) =>
      !value.items.length || (value.shopId && value.shopName && value.slug),
  );
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
export function CommerceProvider({ children }) {
  const { user, loading } = useAuth();
  const [signInRequired, setSignInRequired] = useState(false);
  const [location, setLocation] = useState(() => {
    const parsed = locationSchema.safeParse(read("lc-location", null));
    return parsed.success
      ? parsed.data
      : { city: "", neighborhood: "", pinCode: "" };
  });
  const [cart, setCart] = useState(() => {
    const parsed = cartSchema.safeParse(read("lc-cart", null));
    return parsed.success ? parsed.data : { items: [] };
  });
  const [toast, setToast] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem("lc-location", JSON.stringify(location));
    } catch {}
  }, [location]);
  useEffect(() => {
    try {
      localStorage.setItem("lc-cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function add(product, shop, quantity = 1) {
    if (loading) {
      setToast("Restoring your account. Please try again in a moment.");
      return;
    }
    if (!user) {
      setSignInRequired(true);
      return;
    }
    if (user.role !== "customer") {
      setToast("Use a customer account to place orders.");
      return;
    }
    if (cart.items.length && cart.shopId !== shop._id) {
      setToast(
        "Your cart contains items from another store. Open your cart and clear it before switching stores.",
      );
      return;
    }
    const limit = quantityLimit(product);
    if (!limit) {
      setToast("This product is out of stock.");
      return;
    }
    const requested = Math.max(1, Math.trunc(quantity) || 1);
    const existingQuantity =
      cart.items.find((item) => item.productId === product._id)?.quantity || 0;
    setCart((current) => {
      const exists = current.items.find(
        (item) => item.productId === product._id,
      );
      return {
        shopId: shop._id,
        shopName: shop.name,
        slug: shop.slug,
        items: exists
          ? current.items.map((item) =>
              item.productId === product._id
                ? {
                    ...item,
                    maxQuantity: limit,
                    quantity: Math.min(limit, item.quantity + requested),
                  }
                : item,
            )
          : [
              ...current.items,
              {
                productId: product._id,
                name: product.name,
                unit: product.unit,
                price: product.price,
                quantity: Math.min(limit, requested),
                maxQuantity: limit,
              },
            ],
      };
    });
    setToast(
      existingQuantity + requested > limit
        ? `You can add up to ${limit} of this product. Your basket is capped at ${limit}.`
        : "Added to your basket.",
    );
  }
  function quantity(id, amount) {
    const item = cart.items.find((item) => item.productId === id);
    if (item && amount > (item.maxQuantity ?? 100))
      setToast(`Only ${item.maxQuantity ?? 100} can be added to your basket.`);
    setCart((current) => ({
      ...current,
      items: current.items
        .map((item) =>
          item.productId === id
            ? {
                ...item,
                quantity: Math.min(
                  item.maxQuantity ?? 100,
                  Math.max(0, Math.trunc(amount) || 0),
                ),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    }));
  }
  const syncStock = useCallback((products) => {
    const byId = new Map(products.map((product) => [product._id, product]));
    setCart((current) => {
      const items = current.items
        .map((item) => {
          const maxQuantity = quantityLimit(byId.get(item.productId));
          return {
            ...item,
            maxQuantity,
            quantity: Math.min(item.quantity, maxQuantity),
          };
        })
        .filter((item) => item.quantity > 0);
      return JSON.stringify(items) === JSON.stringify(current.items)
        ? current
        : { ...current, items };
    });
  }, []);
  return (
    <Context.Provider
      value={{
        location,
        setLocation,
        cart,
        add,
        quantity,
        syncStock,
        clear: () => setCart({ items: [] }),
        notify: setToast,
        signInRequired,
        dismissSignIn: () => setSignInRequired(false),
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <T>{toast}</T>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useCommerce = () => useContext(Context);
