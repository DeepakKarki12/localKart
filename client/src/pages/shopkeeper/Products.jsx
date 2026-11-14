import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useState } from "react";
import { z } from "zod";
import { useShop } from "./ShopPages";
import {
  Form,
  QueryState,
  PageHeading,
  Image,
  useAction,
  useData,
  Pagination,
  Status,
} from "../../components/MarketUI";
import { ImageUpload } from "../../components/ImageUpload";
import { Button } from "../../components/UI";
import { money, rupeesToPaise } from "../../utils/format";
import { useCommerce } from "../../context/CommerceContext";
const schema = z
  .object({
    name: z.string().min(2).max(300),
    description: z.string().max(2000),
    categoryId: z.string().min(1, "Choose a category."),
    catalogId: z.string(),
    price: z.number().min(0).max(1000000),
    mrp: z.number().min(0).max(1000000),
    unit: z.string().min(1).max(100),
    stockQuantity: z.number().int().min(0).max(1000000),
    inventoryTrackingEnabled: z.enum(["true", "false"]),
    availabilityStatus: z.enum([
      "AVAILABLE",
      "CONFIRM_AVAILABILITY",
      "OUT_OF_STOCK",
    ]),
    active: z.enum(["true", "false"]),
  })
  .refine((v) => !v.mrp || v.mrp >= v.price, {
    path: ["mrp"],
    message: "MRP cannot be lower than selling price.",
  });
const blank = {
  name: "",
  description: "",
  categoryId: "",
  catalogId: "",
  price: 0,
  mrp: 0,
  unit: "1 piece",
  stockQuantity: 0,
  inventoryTrackingEnabled: "false",
  availabilityStatus: "AVAILABLE",
  active: "true",
};
export function Products() {
  const { t } = useLanguage();
  const shop = useShop();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const { notify } = useCommerce();
  const action = useAction();
  const categories = useData(
    ["manage-categories", shop._id, "all"],
    `/manage/shops/${shop._id}/categories?limit=100`,
  );
  const products = useData(
    ["manage-products", shop._id, search, category, page],
    `/manage/shops/${shop._id}/products?${new URLSearchParams({ search, page, ...(category ? { categoryId: category } : {}) })}`,
  );
  const catalog = useData(
    ["catalog", catalogSearch, barcode],
    `/catalog?${new URLSearchParams(barcode ? { barcode } : { search: catalogSearch })}`,
    { enabled: show },
  );
  function start(product) {
    setEdit(product);
    setShow(true);
  }
  const defaults = edit
    ? {
        name: edit.name,
        description: edit.description || "",
        categoryId: edit.categoryId,
        catalogId:
          typeof edit.catalogId === "object"
            ? edit.catalogId?._id || ""
            : edit.catalogId || "",
        price: edit.price / 100,
        mrp: (edit.mrp || 0) / 100,
        unit: edit.unit,
        stockQuantity: edit.stockQuantity,
        inventoryTrackingEnabled: String(edit.inventoryTrackingEnabled),
        availabilityStatus: edit.availabilityStatus,
        active: String(edit.active),
      }
    : blank;
  const fields = [
    { name: "name", label: "Product name" },
    {
      name: "categoryId",
      label: "Category",
      type: "select",
      options: [
        { value: "", label: "Choose a category" },
        ...(categories.data?.items
          .filter((c) => c.active)
          .map((c) => ({ value: c._id, label: c.name })) || []),
      ],
    },
    { name: "description", label: "Description", type: "textarea", wide: true },
    { name: "price", label: "Selling price (₹)", type: "number", step: "0.01" },
    {
      name: "mrp",
      label: "MRP (₹, 0 if unused)",
      type: "number",
      step: "0.01",
    },
    { name: "unit", label: "Unit or pack size" },
    {
      name: "availabilityStatus",
      label: "Availability",
      type: "select",
      options: [
        { value: "AVAILABLE", label: "Available" },
        { value: "CONFIRM_AVAILABILITY", label: "Confirm availability" },
        { value: "OUT_OF_STOCK", label: "Out of stock" },
      ],
    },
    {
      name: "inventoryTrackingEnabled",
      label: "Track exact stock?",
      type: "select",
      options: [
        { value: "false", label: "No — availability only" },
        { value: "true", label: "Yes — reserve stock on orders" },
      ],
    },
    {
      name: "stockQuantity",
      label: "Unreserved stock quantity",
      type: "number",
      help: "Available to new orders; pending orders are already reserved.",
    },
    {
      name: "active",
      label: "Listing status",
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Archived" },
      ],
    },
    {
      name: "catalogId",
      label: "Shared catalog image",
      type: "select",
      wide: true,
      options: [
        { value: "", label: "No shared image" },
        ...(catalog.data?.items.map((item) => ({
          value: item._id,
          label: `${item.name} · ${item.unit}`,
        })) || []),
        ...(edit?.catalogId?._id &&
        !catalog.data?.items.some((item) => item._id === edit.catalogId._id)
          ? [{ value: edit.catalogId._id, label: edit.catalogId.name }]
          : []),
      ],
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Keep your digital shelves fresh"
        title={t("Your products")}
      >
        <Button
          onClick={() => {
            setEdit(null);
            setShow(!show);
          }}
        >
          <T>{show ? "Close form" : "+ Add product"}</T>
        </Button>
      </PageHeading>
      {show && (
        <div className="panel">
          <h2>
            <T>{edit ? "Edit product" : "Add a product"}</T>
          </h2>
          <div className="catalog-search">
            <label>
              <T>{"Find a reusable catalog entry"}</T>
              <input
                placeholder={t("Search branded product name")}
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value);
                  setBarcode("");
                }}
              />
            </label>
            <label>
              <T>{"Barcode"}</T>
              <input
                placeholder={t("Scan or type barcode")}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </label>
            <Button
              className="secondary"
              onClick={async () => {
                if (!("BarcodeDetector" in window))
                  return notify(
                    "Camera scanning is not supported in this browser. Use a USB scanner or enter the barcode.",
                  );
                let stream;
                try {
                  stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" },
                  });
                  const video = document.createElement("video");
                  video.srcObject = stream;
                  await video.play();
                  const detector = new window.BarcodeDetector({
                    formats: ["ean_13", "ean_8", "upc_a"],
                  });
                  let result = [];
                  for (let i = 0; i < 30 && !result.length; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    result = await detector.detect(video);
                  }
                  if (result.length) setBarcode(result[0].rawValue);
                  else notify("No barcode found. Enter it manually.");
                } catch {
                  notify(
                    "Camera unavailable. Enter or scan the barcode with a USB scanner.",
                  );
                } finally {
                  stream?.getTracks().forEach((track) => track.stop());
                }
              }}
            >
              <T>{"Scan barcode"}</T>
            </Button>
          </div>
          {catalog.data?.items.length > 0 && (
            <div className="catalog-choices">
              {catalog.data.items.slice(0, 5).map((item) => (
                <button
                  key={item._id}
                  onClick={() => {
                    setEdit({
                      ...blank,
                      ...(edit || {}),
                      name: item.name,
                      description: item.description,
                      unit: item.unit,
                      catalogId: item,
                      price: edit?.price || 0,
                      mrp: edit?.mrp || 0,
                      categoryId: edit?.categoryId || "",
                      inventoryTrackingEnabled:
                        edit?.inventoryTrackingEnabled ?? false,
                      active: edit?.active ?? true,
                    });
                  }}
                >
                  <Image image={item.image} alt={item.name} />
                  <span>
                    <T>{"Prefill"}</T> {item.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Form
            key={`${edit?._id || "new"}-${edit?.name || ""}-${edit?.catalogId?._id || ""}`}
            schema={schema}
            defaults={defaults}
            fields={fields}
            submitLabel={edit?._id ? "Save product" : "Create product"}
            onSubmit={async (values) => {
              const data = {
                ...values,
                price: rupeesToPaise(values.price),
                mrp: values.mrp ? rupeesToPaise(values.mrp) : null,
                catalogId: values.catalogId || null,
                inventoryTrackingEnabled:
                  values.inventoryTrackingEnabled === "true",
                active: values.active === "true",
              };
              await action.mutateAsync({
                method: edit?._id ? "patch" : "post",
                url: edit?._id
                  ? `/products/${edit._id}`
                  : `/shops/${shop._id}/products`,
                data,
              });
              setShow(false);
              setEdit(null);
            }}
          />
          {edit?._id && (
            <ImageUpload
              type="product"
              id={edit._id}
              image={
                products.data?.items.find((p) => p._id === edit._id)?.image
              }
            />
          )}
          <p className="muted">
            <T>
              {
                "Create a product first, then edit it to upload an optional photo. Custom photos override shared catalog images."
              }
            </T>
          </p>
        </div>
      )}
      <div className="store-toolbar">
        <input
          className="search-input"
          value={search}
          placeholder={t("Search your products")}
          aria-label={t("Search your products")}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={category}
          aria-label={t("Product category")}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            <T>{"All categories"}</T>
          </option>
          {categories.data?.items.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {selected.length > 0 && (
        <div className="bulk-actions">
          <strong>
            {selected.length} <T>{"selected"}</T>
          </strong>
          {["AVAILABLE", "CONFIRM_AVAILABILITY", "OUT_OF_STOCK"].map(
            (status) => (
              <Button
                className="secondary"
                key={status}
                busy={action.isPending}
                onClick={() => {
                  action.mutate(
                    {
                      method: "patch",
                      url: `/shops/${shop._id}/availability`,
                      data: { ids: selected, availabilityStatus: status },
                    },
                    { onSuccess: () => setSelected([]) },
                  );
                }}
              >
                {status.replaceAll("_", " ")}
              </Button>
            ),
          )}
        </div>
      )}
      <QueryState query={products} empty={products.data?.items.length === 0}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Select"}</T>
                </th>
                <th>
                  <T>{"Product"}</T>
                </th>
                <th>
                  <T>{"Price"}</T>
                </th>
                <th>
                  <T>{"Availability / stock"}</T>
                </th>
                <th>
                  <T>{"Actions"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.data?.items.map((product) => (
                <tr key={product._id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name}`}
                      checked={selected.includes(product._id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, product._id]
                            : selected.filter((id) => id !== product._id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="product-cell">
                      <Image
                        image={product.image || product.catalogId?.image}
                        alt={product.name}
                      />
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          {product.unit} ·{" "}
                          <T>{product.active ? "Active" : "Archived"}</T>
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{money(product.price)}</td>
                  <td>
                    <Status value={product.availabilityStatus} />
                    <small>
                      {product.inventoryTrackingEnabled
                        ? `${product.stockQuantity} unreserved`
                        : "Availability only"}
                    </small>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        className="secondary"
                        onClick={() => start(product)}
                      >
                        <T>{"Edit"}</T>
                      </Button>
                      <Button
                        className="secondary"
                        busy={action.isPending}
                        onClick={() =>
                          action.mutate({
                            method: "delete",
                            url: `/products/${product._id}`,
                          })
                        }
                      >
                        <T>{"Archive"}</T>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={products.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
