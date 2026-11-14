// Pure schedule calculation shared by the API and customer storefront.
export function openingState(shop, now = new Date()) {
  if (shop.temporarilyClosed)
    return { open: false, text: "Temporarily closed" };
  if (!shop.openingHours?.length)
    return { open: true, text: "Hours not provided" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const parse = (value) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const today = shop.openingHours.find((h) => h.day === day);
  const previous = shop.openingHours.find((h) => h.day === (day + 6) % 7);
  const carried =
    previous &&
    !previous.closed &&
    parse(previous.open) > parse(previous.close) &&
    minute < parse(previous.close);
  const open =
    !!carried ||
    !!(
      today &&
      !today.closed &&
      (parse(today.open) <= parse(today.close)
        ? minute >= parse(today.open) && minute < parse(today.close)
        : minute >= parse(today.open))
    );
  return { open, text: open ? "Open now" : "Closed now" };
}
