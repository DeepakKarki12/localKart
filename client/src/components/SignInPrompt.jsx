import { T } from "../i18n/LanguageContext";
import { Link } from "react-router-dom";
import { ShoppingBasket, X } from "lucide-react";
import { useCommerce } from "../context/CommerceContext";
import { Dialog } from "./Dialog";
import { Button } from "./UI";

export function SignInPrompt() {
  const { signInRequired, dismissSignIn } = useCommerce();
  if (!signInRequired) return null;
  return (
    <Dialog label="Sign in to buy" onClose={dismissSignIn}>
      <button
        className="modal-close"
        aria-label="Close sign-in popup"
        onClick={dismissSignIn}
      >
        <X size={20} />
      </button>
      <span className="feature-icon inline-flex">
        <ShoppingBasket size={28} />
      </span>
      <h2>
        <T>{"Sign in to buy"}</T>
      </h2>
      <p>
        <T>
          {
            "Sign in or create a customer account to add items to your basket and order from your neighborhood stores."
          }
        </T>
      </p>
      <div className="row-actions">
        <Link className="button" to="/login" onClick={dismissSignIn}>
          <T>{"Sign in"}</T>
        </Link>
        <Link
          className="button secondary"
          to="/register"
          onClick={dismissSignIn}
        >
          <T>{"Create an account"}</T>
        </Link>
      </div>
      <Button className="secondary" onClick={dismissSignIn}>
        <T>{"Continue browsing"}</T>
      </Button>
    </Dialog>
  );
}
