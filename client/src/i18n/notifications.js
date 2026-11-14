export function notificationText(item, t) {
  if (item.type === "BOOKING_UPDATE" && item.bookingTitle && item.bookingStatus)
    return t("Booking update: {title} · {status}.", {
      title: item.bookingTitle,
      status: t(item.bookingStatus),
    });
  if (item.type === "PRODUCT_AVAILABLE" && item.productName && item.shopName) {
    return t("Your requested item, {product}, is now available at {shop}.", {
      product: item.productName,
      shop: item.shopName,
    });
  }
  if (item.orderNumber && item.type === "NEW_ORDER") {
    return t("New order {number} needs confirmation.", {
      number: item.orderNumber,
    });
  }
  if (item.orderNumber && item.orderStatus && item.type === "ORDER_STATUS") {
    return t("{number}: {status}.", {
      number: item.orderNumber,
      status: t(item.orderStatus.replaceAll("_", " ").toLowerCase()),
    });
  }
  return item.message;
}
