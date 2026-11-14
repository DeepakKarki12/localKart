import { T } from "../../i18n/LanguageContext";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../context/AuthContext";
import { useCommerce } from "../../context/CommerceContext";
import { Form, PageHeading } from "../../components/MarketUI";
import { api } from "../../services/api";
export const applicationFields = [
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
  {
    name: "category",
    label: "Store category",
    placeholder: "Groceries, pharmacy, stationery…",
  },
  { name: "phone", label: "Shop mobile number", type: "tel" },
  { name: "address", label: "Street address", wide: true },
  { name: "city", label: "City" },
  { name: "neighborhood", label: "Neighborhood" },
  { name: "pinCode", label: "PIN code" },
  {
    name: "description",
    label: "Tell customers about your shop",
    type: "textarea",
    wide: true,
  },
  {
    name: "businessDetails",
    label: "Business registration details (optional)",
    wide: true,
  },
];
export const applicationSchema = z.object({
  businessType: z.enum(["RETAIL", "CLASSES", "BARBER"]),
  name: z.string().trim().min(2).max(300),
  category: z.string().min(2).max(300),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Use a valid 10-digit mobile number."),
  address: z.string().min(3).max(300),
  city: z.string().min(2).max(300),
  neighborhood: z.string().min(2).max(300),
  pinCode: z.string().regex(/^[1-9]\d{5}$/, "Use a valid six-digit PIN."),
  description: z.string().max(2000),
  businessDetails: z.string().max(1000),
});
export function Application() {
  const { user, reloadUser } = useAuth();
  const { notify } = useCommerce();
  const navigate = useNavigate();
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Big possibilities for your small business"
        title="Bring your store online."
      />
      <div className="cart-layout">
        <div className="panel">
          {!user ? (
            <>
              <h2>
                <T>{"Start with your owner account"}</T>
              </h2>
              <p>
                <T>
                  {
                    "Create an account using your name, email and mobile number, then return here to apply."
                  }
                </T>
              </p>
              <Link className="button" to="/register">
                <T>{"Create owner account"}</T>
              </Link>{" "}
              <Link className="text-link" to="/login">
                <T>{"Already registered? Sign in"}</T>
              </Link>
            </>
          ) : user.role === "shopkeeper" ? (
            <>
              <h2>
                <T>{"You already have an application"}</T>
              </h2>
              <Link className="button" to="/shopkeeper">
                <T>{"View shop status"}</T>
              </Link>
            </>
          ) : user.role === "admin" ? (
            <p>Administrators cannot submit store applications.</p>
          ) : (
            <>
              <h2>
                <T>{"Store application"}</T>
              </h2>
              <p className="muted">
                Owner: {user.name} · {user.email}. You can add a shop photo from
                your application status page.
              </p>
              <Form
                schema={applicationSchema}
                defaults={{
                  businessType: "RETAIL",
                  name: "",
                  category: "",
                  phone: user.phone,
                  address: "",
                  city: "",
                  neighborhood: "",
                  pinCode: "",
                  description: "",
                  businessDetails: "",
                }}
                fields={applicationFields}
                submitLabel="Submit for verification"
                onSubmit={async (values) => {
                  await api.post("/shops/apply", values);
                  await reloadUser();
                  notify(
                    "Application submitted. Our team will review your store.",
                  );
                  navigate("/shopkeeper");
                }}
              />
            </>
          )}
        </div>
        <aside className="panel soft">
          <h2>
            <T>{"Your shop. Your customers."}</T>
          </h2>
          <p>
            <T>{"We partner with local shops, without owning inventory."}</T>
          </p>
          <ol className="simple-list">
            <li>
              <T>{"Tell us about your store."}</T>
            </li>
            <li>
              <T>
                {"Our team reviews the application and verifies it in person."}
              </T>
            </li>
            <li>
              <T>{"Once approved, add products and share your storefront."}</T>
            </li>
          </ol>
          <p className="muted">
            <T>
              {
                "Applying does not activate your store. Delivery is enabled separately by the administrator."
              }
            </T>
          </p>
        </aside>
      </div>
    </section>
  );
}
