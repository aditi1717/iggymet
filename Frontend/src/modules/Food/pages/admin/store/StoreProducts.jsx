import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Store,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { adminAPI, uploadAPI } from "@food/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog";

const RUPEE = "\u20B9";

const createEmptyVariant = () => ({
  _tempId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "Standard",
  price: "",
  stock: "",
});

const createEmptyForm = () => ({
  name: "",
  description: "",
  image: "",
  category: "",
  isPublished: false,
  variants: [createEmptyVariant()],
});

const getProductId = (product) => product?._id || product?.id;

export default function StoreProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPublished, setFilterPublished] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProduct, setStockProduct] = useState(null);
  const [stockDeltas, setStockDeltas] = useState({});
  const [updatingStock, setUpdatingStock] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStoreProducts({ limit: 200 });
      const list = response?.data?.data?.products || response?.data?.products || [];
      setProducts(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load store products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPublished]);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((product) =>
        product?.name?.toLowerCase().includes(query) ||
        product?.category?.toLowerCase().includes(query) ||
        product?.description?.toLowerCase().includes(query)
      );
    }

    if (filterPublished === "published") {
      result = result.filter((product) => product?.isPublished);
    }

    if (filterPublished === "draft") {
      result = result.filter((product) => !product?.isPublished);
    }

    return result;
  }, [products, searchQuery, filterPublished]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const resetImageState = () => {
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview("");
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    resetImageState();
  };

  const openAdd = () => {
    setFormMode("add");
    setEditingId(null);
    setForm(createEmptyForm());
    resetImageState();
    setShowFormModal(true);
  };

  const openEdit = (product) => {
    const normalizedVariants = Array.isArray(product?.variants) && product.variants.length
      ? product.variants.map((variant) => ({
          _id: variant._id,
          _tempId: variant._id || `v-${Math.random().toString(36).slice(2, 8)}`,
          name: variant.name || "",
          price: String(variant.price ?? ""),
          stock: String(variant.stock ?? ""),
        }))
      : [createEmptyVariant()];

    setFormMode("edit");
    setEditingId(getProductId(product));
    setForm({
      name: product?.name || "",
      description: product?.description || "",
      image: product?.image || "",
      category: product?.category || "",
      isPublished: Boolean(product?.isPublished),
      variants: normalizedVariants,
    });
    resetImageState();
    setImagePreview(product?.image || "");
    setShowFormModal(true);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const addVariant = () => {
    setForm((previousForm) => ({
      ...previousForm,
      variants: [...previousForm.variants, createEmptyVariant()],
    }));
  };

  const removeVariant = (tempId) => {
    setForm((previousForm) => {
      const remainingVariants = previousForm.variants.filter((variant) => variant._tempId !== tempId);
      return {
        ...previousForm,
        variants: remainingVariants.length ? remainingVariants : [createEmptyVariant()],
      };
    });
  };

  const changeVariant = (tempId, field, value) => {
    setForm((previousForm) => ({
      ...previousForm,
      variants: previousForm.variants.map((variant) =>
        variant._tempId === tempId ? { ...variant, [field]: value } : variant,
      ),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (form.variants.length === 0) {
      toast.error("At least one variant is required");
      return;
    }

    for (const variant of form.variants) {
      if (!variant.name.trim()) {
        toast.error("Each variant must have a name");
        return;
      }

      if (variant.price === "" || Number(variant.price) < 0) {
        toast.error("Each variant must have a valid price");
        return;
      }

      if (variant.stock === "" || Number(variant.stock) < 0) {
        toast.error("Each variant must have a valid stock");
        return;
      }
    }

    try {
      setSubmitting(true);
      let imageUrl = form.image;

      if (imageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(imageFile, { folder: "store-products" });
        imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url || imageUrl;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        image: imageUrl,
        category: form.category.trim(),
        isPublished: form.isPublished,
        variants: form.variants.map((variant) => ({
          ...(variant._id ? { _id: variant._id } : {}),
          name: variant.name.trim(),
          price: Number(variant.price),
          stock: Number(variant.stock),
        })),
      };

      if (formMode === "edit") {
        await adminAPI.updateStoreProduct(editingId, payload);
        toast.success("Product updated successfully");
      } else {
        await adminAPI.createStoreProduct(payload);
        toast.success("Product created successfully");
      }

      closeFormModal();
      fetchProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePublish = async (product) => {
    const productId = getProductId(product);

    try {
      await adminAPI.updateStoreProduct(productId, {
        isPublished: !product?.isPublished,
      });

      setProducts((previousProducts) =>
        previousProducts.map((currentProduct) =>
          getProductId(currentProduct) === productId
            ? { ...currentProduct, isPublished: !currentProduct.isPublished }
            : currentProduct,
        ),
      );

      toast.success(`Product ${product?.isPublished ? "unpublished" : "published"} successfully`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update product");
    }
  };

  const handleDelete = async (product) => {
    const productId = getProductId(product);
    if (!window.confirm(`Delete "${product?.name}"? This cannot be undone.`)) return;

    try {
      await adminAPI.deleteStoreProduct(productId);
      setProducts((previousProducts) =>
        previousProducts.filter((currentProduct) => getProductId(currentProduct) !== productId),
      );
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete product");
    }
  };

  const openStockModal = (product) => {
    const deltas = {};
    (product?.variants || []).forEach((variant) => {
      deltas[variant._id] = "";
    });

    setStockProduct(product);
    setStockDeltas(deltas);
    setShowStockModal(true);
  };

  const handleStockUpdate = async () => {
    if (!stockProduct) return;

    const validEntries = Object.entries(stockDeltas).filter(
      ([, delta]) => delta !== "" && !Number.isNaN(Number(delta)),
    );

    if (validEntries.length === 0) {
      toast.error("Enter a stock change value for at least one variant");
      return;
    }

    try {
      setUpdatingStock(true);

      for (const [variantId, delta] of validEntries) {
        if (Number(delta) === 0) continue;
        await adminAPI.updateStoreProductStock(getProductId(stockProduct), variantId, Number(delta));
      }

      toast.success("Stock updated successfully");
      setShowStockModal(false);
      fetchProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update stock");
    } finally {
      setUpdatingStock(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Store Products</h1>
            <p className="text-xs text-slate-500">Products that delivery boys can purchase</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Total:</span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
              {filteredProducts.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>

            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            <select
              value={filterPublished}
              onChange={(event) => setFilterPublished(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {["#", "Image", "Product", "Category", "Variants", "Status", "Actions"].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                      <p className="text-sm text-slate-500">Loading products...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <PackageOpen className="h-10 w-10 text-slate-300" />
                      <p className="text-sm font-medium text-slate-600">No products found</p>
                      <p className="text-xs text-slate-400">Create your first product using the button above</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product, index) => (
                  <tr key={getProductId(product)} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {(currentPage - 1) * pageSize + index + 1}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {product?.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <PackageOpen className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900">{product?.name}</p>
                      {product?.description ? (
                        <p className="max-w-[200px] truncate text-xs text-slate-500">{product.description}</p>
                      ) : null}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {product?.category || <span className="text-slate-400">-</span>}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        {(product?.variants || []).map((variant) => (
                          <div key={variant._id} className="flex items-center gap-2 text-xs text-slate-700">
                            <span className="font-medium">{variant.name}</span>
                            <span className="text-slate-400">
                              {RUPEE}
                              {variant.price}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                variant.stock > 0
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-600"
                              }`}
                            >
                              Stock: {variant.stock}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => togglePublish(product)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          product?.isPublished
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {product?.isPublished ? (
                          <ToggleRight className="h-3.5 w-3.5" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                        {product?.isPublished ? "Published" : "Draft"}
                      </button>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openStockModal(product)}
                          title="Update Stock"
                          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                        >
                          Stock
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          title="Edit"
                          className="rounded-md p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product)}
                          title="Delete"
                          className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredProducts.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3.5">
            <span className="text-sm text-slate-600">
              Showing <b>{(currentPage - 1) * pageSize + 1}</b>-<b>{Math.min(currentPage * pageSize, filteredProducts.length)}</b> of <b>{filteredProducts.length}</b>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={showFormModal}
        onOpenChange={(open) => {
          if (!open) closeFormModal();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {formMode === "edit" ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Product Image</label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <PackageOpen className="h-8 w-8 text-slate-300" />
                  )}
                </div>

                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                  Choose Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((previousForm) => ({ ...previousForm, name: event.target.value }))}
                  placeholder="e.g. Delivery Jacket"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(event) => setForm((previousForm) => ({ ...previousForm, category: event.target.value }))}
                  placeholder="e.g. Uniform, Equipment"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((previousForm) => ({ ...previousForm, description: event.target.value }))}
                placeholder="Short description of this product..."
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.isPublished}
                  onChange={(event) =>
                    setForm((previousForm) => ({ ...previousForm, isPublished: event.target.checked }))
                  }
                />
                <div className="h-5 w-10 rounded-full bg-slate-200 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-5" />
              </label>

              <span className="text-sm font-medium text-slate-700">
                {form.isPublished ? "Published (visible to delivery boys)" : "Draft (hidden from delivery boys)"}
              </span>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-800">Variants *</label>
                <button
                  type="button"
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Variant
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="mb-1 hidden gap-2 md:grid md:grid-cols-[1.2fr_1fr_1fr_auto]">
                  <span className="text-[11px] font-medium text-slate-500">Name</span>
                  <span className="text-[11px] font-medium text-slate-500">Price ({RUPEE})</span>
                  <span className="text-[11px] font-medium text-slate-500">Stock</span>
                  <span className="text-[11px] font-medium text-slate-500">Action</span>
                </div>

                {form.variants.map((variant) => (
                  <div key={variant._tempId} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto]">
                    <input
                      type="text"
                      value={variant.name}
                      placeholder="e.g. Large"
                      onChange={(event) => changeVariant(variant._tempId, "name", event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      type="number"
                      value={variant.price}
                      placeholder="0"
                      min={0}
                      onChange={(event) => changeVariant(variant._tempId, "price", event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      type="number"
                      value={variant.stock}
                      placeholder="0"
                      min={0}
                      onChange={(event) => changeVariant(variant._tempId, "stock", event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(variant._tempId)}
                      aria-label="Delete variant"
                      className="justify-self-start rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 md:justify-self-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={closeFormModal}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {formMode === "edit" ? "Update Product" : "Create Product"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showStockModal}
        onOpenChange={(open) => {
          if (!open) setShowStockModal(false);
        }}
      >
        <DialogContent className="max-w-md overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Update Stock - {stockProduct?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-6">
            <p className="text-xs text-slate-500">
              Enter positive number to add stock, negative to reduce. Leave blank to skip.
            </p>

            {(stockProduct?.variants || []).map((variant) => (
              <div key={variant._id} className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{variant.name}</p>
                  <p className="text-xs text-slate-500">
                    Current stock: <b>{variant.stock}</b>
                  </p>
                </div>

                <input
                  type="number"
                  value={stockDeltas[variant._id] ?? ""}
                  onChange={(event) =>
                    setStockDeltas((previousState) => ({
                      ...previousState,
                      [variant._id]: event.target.value,
                    }))
                  }
                  placeholder="+/- delta"
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowStockModal(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStockUpdate}
              disabled={updatingStock}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updatingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update Stock
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
