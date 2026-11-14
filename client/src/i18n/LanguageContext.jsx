import { createContext, useContext, useEffect, useMemo, useState } from "react";
import hindi from "./hi";

const LanguageContext = createContext(null);
const statuses = {
  PENDING: "लंबित",
  WAITING: "इंतज़ार में",
  ONGOING: "काम जारी है",
  CONFIRMED: "बुकिंग पक्की",
  EXPIRED: "समय समाप्त",
  SCHEDULED: "निर्धारित",
  TEACHING: "पढ़ाई",
  GYM: "जिम",
  YOGA: "योग",
  ACCEPTED: "स्वीकृत",
  PREPARING: "तैयार हो रहा है",
  READY_FOR_PICKUP: "लेने के लिए तैयार",
  OUT_FOR_DELIVERY: "डिलीवरी के लिए निकला",
  COMPLETED: "पूरा हुआ",
  REJECTED: "अस्वीकृत",
  CANCELLED: "रद्द",
  AVAILABLE: "उपलब्ध",
  CONFIRM_AVAILABILITY: "उपलब्धता की पुष्टि करें",
  OUT_OF_STOCK: "स्टॉक में नहीं है",
  APPROVED: "मंज़ूर",
  SUSPENDED: "निलंबित",
  PAID: "भुगतान हो गया",
  UNPAID: "भुगतान बाकी है",
  CASH_ON_DELIVERY: "डिलीवरी पर नकद",
  PAY_AT_STORE: "दुकान पर भुगतान",
  PICKUP: "दुकान से लें",
  DELIVERY: "होम डिलीवरी",
};
export const LANGUAGE_KEY = "lc-language";
export function translate(language, text, values = {}) {
  if (typeof text !== "string") return text;
  const result =
    language === "hi"
      ? hindi[text.trim()] ||
        statuses[text.trim().toUpperCase().replaceAll(" ", "_")] ||
        text
      : text;
  return result.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem(LANGUAGE_KEY) === "hi" ? "hi" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [language]);
  const value = useMemo(
    () => ({
      language,
      setLanguage: (next) => {
        if (next === "en" || next === "hi") setLanguage(next);
      },
      t: (text, values) => translate(language, text, values),
    }),
    [language],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage requires LanguageProvider");
  return context;
}

// Renders text without adding markup, so it also works inside buttons and options.
export function T({ children, values }) {
  const { t } = useLanguage();
  return t(children, values);
}
