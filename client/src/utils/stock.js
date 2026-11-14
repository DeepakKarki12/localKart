export function quantityLimit(product) {
  if (
    !product ||
    !product.active ||
    product.availabilityStatus === "OUT_OF_STOCK"
  )
    return 0;
  return product.inventoryTrackingEnabled
    ? Math.max(0, Math.min(100, Math.trunc(product.stockQuantity || 0)))
    : 100;
}
