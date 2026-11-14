import { Languages } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  return (
    <label className="language-selector">
      <Languages size={17} aria-hidden="true" />
      <span className="sr-only">Language / भाषा</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="hi" lang="hi">
          हिंदी
        </option>
      </select>
    </label>
  );
}
