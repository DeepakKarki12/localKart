import { T } from "../i18n/LanguageContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { z } from "zod";
import { useCommerce } from "../context/CommerceContext";
import { Form } from "./MarketUI";
import { Button } from "./UI";
const schema = z
  .object({
    city: z.string().trim().max(100),
    neighborhood: z.string().trim().max(100),
    pinCode: z
      .string()
      .regex(/^$|^[1-9]\d{5}$/, "Enter a valid six-digit PIN."),
  })
  .refine((v) => v.city || v.pinCode, {
    path: ["city"],
    message: "Choose a city or enter a PIN code.",
  });
export function LocationPicker() {
  const { t } = useLanguage();
  const { location, setLocation, notify } = useCommerce();
  const [open, setOpen] = useState(false);
  return (
    <div className="location-picker">
      <button
        className="location-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <MapPin size={16} />
        <span>
          {location.pinCode || location.city || t("Choose your neighborhood")}
          <small>{location.neighborhood || t("Change location")}</small>
        </span>
      </button>
      {open && (
        <div className="location-panel">
          <h2>
            <T>{"Where are you shopping?"}</T>
          </h2>
          <p>
            <T>{"Choose a city or PIN. Precise location is optional."}</T>
          </p>
          <Form
            schema={schema}
            defaults={location}
            fields={[
              { name: "city", label: "City" },
              { name: "neighborhood", label: "Neighborhood" },
              { name: "pinCode", label: "Postal PIN code" },
            ]}
            submitLabel="Use this location"
            onSubmit={async (values) => {
              setLocation({ ...values, coordinates: location.coordinates });
              setOpen(false);
            }}
          />
          <Button
            className="secondary"
            onClick={() => {
              if (!navigator.geolocation) {
                notify(
                  "Location is unavailable. Select your city or PIN instead.",
                );
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  setLocation({
                    ...location,
                    coordinates: {
                      lat: position.coords.latitude,
                      lng: position.coords.longitude,
                    },
                  });
                  notify(
                    "Location saved for approximate distances. Select a city or PIN to filter stores.",
                  );
                },
                () =>
                  notify(
                    "Location access was unavailable. You can still browse by city or PIN.",
                  ),
                { timeout: 10000, maximumAge: 600000 },
              );
            }}
          >
            <LocateFixed size={16} /> <T>{"Use approximate distances"}</T>
          </Button>
        </div>
      )}
    </div>
  );
}
