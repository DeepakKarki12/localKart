import { T } from "../../i18n/LanguageContext";
import { Link } from "react-router-dom";
import { PageHeading, useData } from "../../components/MarketUI";
export function Info({ page }) {
  const settings = useData("public-settings", "/settings");
  const content = {
    about: {
      title: "Your neighborhood. Connected.",
      eyebrow: "Your Neighborhood. Your Stores. Online.",
      body: (
        <>
          <h2>Local shops, a simpler way to shop.</h2>
          <p>
            LocalCart connects you with approved independent shops nearby.
            Browse products, order ahead for pickup, or choose home delivery
            where the shop has delivery enabled.
          </p>
          <p>
            Shopkeepers confirm availability before preparing orders. Product
            listings and preparation estimates are managed by the store. We
            partner with existing shops and do not own inventory or warehouses.
          </p>
          <Link className="button" to="/shops">
            <T>{"Explore nearby stores"}</T>
          </Link>
        </>
      ),
    },
    support: {
      title: "A helping hand, nearby.",
      eyebrow: "LocalCart support",
      body: (
        <>
          <h2>Need help with an order?</h2>
          <p>
            Visit the store’s page to call the shopkeeper about availability,
            preparation or collection. Your order history includes status
            changes and any rejection or cancellation reason.
          </p>
          {settings.data?.supportEmail ? (
            <p>
              For platform support:{" "}
              <a
                className="text-link"
                href={`mailto:${settings.data.supportEmail}`}
              >
                {settings.data.supportEmail}
              </a>
            </p>
          ) : (
            <p>
              The platform operator has not configured a support email yet. For
              an existing order, contact the shop directly.
            </p>
          )}
          <Link className="button secondary" to="/orders">
            View your orders
          </Link>
        </>
      ),
    },
    privacy: {
      title: "Your information at LocalCart.",
      eyebrow: "Privacy information",
      body: (
        <>
          <h2>What this application stores</h2>
          <p>
            Your account includes your name, email, mobile number and any
            addresses you save. Orders store item and price snapshots, contact
            details, fulfillment information and status history. Shopkeepers
            receive details needed to fulfill orders for their own shops.
            Platform administrators can review records to manage the
            marketplace.
          </p>
          <p>
            Passwords are hashed. Session tokens use HTTP-only cookies. Optional
            device location is stored locally in your browser to calculate
            approximate distances. Product and store images are delivered by
            Cloudinary; image files are not stored in MongoDB. The browser
            stores your cart and selected neighborhood locally.
          </p>
          <p>
            Contact platform support for account or data questions. The
            operating business must add its identity, retention periods and
            applicable privacy terms before public launch.
          </p>
        </>
      ),
    },
    terms: {
      title: "Shopping local, clearly.",
      eyebrow: "Ordering information",
      body: (
        <>
          <h2>Orders need store confirmation</h2>
          <p>
            Submitting an order requests the listed items. The shopkeeper must
            accept the order and confirm availability. Preparation times and
            delivery windows are estimates. Payment is made at the shop for
            pickup or in cash on delivery. Online payments are not available.
          </p>
          <p>
            You may cancel a pending order in your account. For accepted orders,
            contact the shop or platform support. Pickup orders require your
            verification code at collection. Keep that code private until
            pickup.
          </p>
          <p>
            Participating shops supply the goods. The operating business must
            publish its full terms, returns and refund policy, legal identity
            and support details before public launch.
          </p>
        </>
      ),
    },
  }[page];
  return (
    <section className="container market-page info-page">
      <PageHeading eyebrow={content.eyebrow} title={content.title} />
      <div className="panel prose">{content.body}</div>
    </section>
  );
}
