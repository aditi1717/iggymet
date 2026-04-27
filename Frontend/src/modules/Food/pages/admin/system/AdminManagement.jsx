import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@food/api";
import { adminSidebarMenu } from "@food/utils/adminSidebarMenu";
import { getCurrentUser } from "@food/utils/auth";

const normalizePath = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const cleaned = raw.replace(/\/+$/, "");
  return cleaned || "/";
};

const buildPermissionOptions = () => {
  const options = [];
  adminSidebarMenu.forEach((item) => {
    if (item?.type === "link" && item?.path) {
      options.push({ label: item.label, path: normalizePath(item.path) });
      return;
    }
    if (item?.type === "section" && Array.isArray(item.items)) {
      item.items.forEach((subItem) => {
        if (subItem?.type === "link" && subItem?.path) {
          options.push({ label: subItem.label, path: normalizePath(subItem.path) });
          return;
        }
        if (subItem?.type === "expandable" && Array.isArray(subItem.subItems)) {
          subItem.subItems.forEach((leaf) => {
            if (!leaf?.path) return;
            options.push({
              label: `${subItem.label} - ${leaf.label}`,
              path: normalizePath(leaf.path),
            });
          });
        }
      });
    }
  });
  const unique = new Map();
  options.forEach((opt) => {
    if (!unique.has(opt.path)) unique.set(opt.path, opt);
  });
  return Array.from(unique.values())
    .filter((opt) => opt.path !== "/admin/food/manage-admins")
    .sort((a, b) => a.label.localeCompare(b.label));
};

const PERMISSION_OPTIONS = buildPermissionOptions();

export default function AdminManagement() {
  const currentAdmin = getCurrentUser("admin");
  const isSuperAdmin = String(currentAdmin?.adminType || "SUPER_ADMIN").toUpperCase() === "SUPER_ADMIN";
  const currentAdminId = currentAdmin?._id || currentAdmin?.id || null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [zones, setZones] = useState([]);
  const [error, setError] = useState("");
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    adminType: "SUB_ADMIN",
    isActive: true,
    permissions: [],
    zoneIds: [],
  });
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    adminType: "SUB_ADMIN",
    isActive: true,
    permissions: [],
    zoneIds: [],
  });

  const isSubAdminForm = form.adminType === "SUB_ADMIN";

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [adminsRes, zonesRes] = await Promise.all([
        adminAPI.getManagedAdmins(),
        adminAPI.getZones({ limit: 500 }),
      ]);
      const adminsList = Array.isArray(adminsRes?.data?.data?.admins)
        ? adminsRes.data.data.admins
        : [];
      const zonesList = Array.isArray(zonesRes?.data?.data?.zones)
        ? zonesRes.data.data.zones
        : [];
      setAdmins(adminsList);
      setZones(zonesList);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPermissionsSet = useMemo(
    () => new Set(form.permissions.map((path) => normalizePath(path))),
    [form.permissions],
  );
  const selectedZoneSet = useMemo(() => new Set(form.zoneIds), [form.zoneIds]);
  const selectedEditPermissionsSet = useMemo(
    () => new Set(editForm.permissions.map((path) => normalizePath(path))),
    [editForm.permissions],
  );
  const selectedEditZoneSet = useMemo(() => new Set(editForm.zoneIds), [editForm.zoneIds]);

  const togglePermission = (path) => {
    const normalized = normalizePath(path);
    setForm((prev) => {
      const exists = prev.permissions.includes(normalized);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== normalized)
          : [...prev.permissions, normalized],
      };
    });
  };

  const toggleZone = (zoneId) => {
    setForm((prev) => {
      const exists = prev.zoneIds.includes(zoneId);
      return {
        ...prev,
        zoneIds: exists ? prev.zoneIds.filter((id) => id !== zoneId) : [...prev.zoneIds, zoneId],
      };
    });
  };

  const toggleEditPermission = (path) => {
    const normalized = normalizePath(path);
    setEditForm((prev) => {
      const exists = prev.permissions.includes(normalized);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== normalized)
          : [...prev.permissions, normalized],
      };
    });
  };

  const toggleEditZone = (zoneId) => {
    setEditForm((prev) => {
      const exists = prev.zoneIds.includes(zoneId);
      return {
        ...prev,
        zoneIds: exists ? prev.zoneIds.filter((id) => id !== zoneId) : [...prev.zoneIds, zoneId],
      };
    });
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      adminType: "SUB_ADMIN",
      isActive: true,
      permissions: [],
      zoneIds: [],
    });
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    try {
      setSaving(true);
      setError("");
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        adminType: form.adminType,
        isActive: form.isActive,
        permissions: isSubAdminForm ? form.permissions : [],
        zoneIds: isSubAdminForm ? form.zoneIds : [],
      };
      await adminAPI.createManagedAdmin(payload);
      resetForm();
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to create admin");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (admin) => {
    if (!isSuperAdmin || !admin?._id) return;
    try {
      setError("");
      await adminAPI.updateManagedAdminStatus(admin._id, !(admin.isActive !== false));
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update admin status");
    }
  };

  const handleStartEdit = (admin) => {
    const zoneIds = Array.isArray(admin?.zoneIds)
      ? admin.zoneIds.map((z) => z?._id || z?.id).filter(Boolean)
      : [];
    setEditingAdminId(admin?._id || null);
    setEditForm({
      name: admin?.name || "",
      email: admin?.email || "",
      phone: admin?.phone || "",
      password: "",
      adminType: admin?.adminType || "SUB_ADMIN",
      isActive: admin?.isActive !== false,
      permissions: Array.isArray(admin?.permissions) ? admin.permissions : [],
      zoneIds,
    });
  };

  const handleCancelEdit = () => {
    setEditingAdminId(null);
    setEditForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      adminType: "SUB_ADMIN",
      isActive: true,
      permissions: [],
      zoneIds: [],
    });
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin || !editingAdminId) return;
    try {
      setSaving(true);
      setError("");
      const payload = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        adminType: editForm.adminType,
        isActive: editForm.isActive,
        permissions: editForm.adminType === "SUB_ADMIN" ? editForm.permissions : [],
        zoneIds: editForm.adminType === "SUB_ADMIN" ? editForm.zoneIds : [],
      };
      if (String(editForm.password || "").trim()) {
        payload.password = editForm.password;
      }
      await adminAPI.updateManagedAdmin(editingAdminId, payload);
      handleCancelEdit();
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update admin");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (!isSuperAdmin || !admin?._id) return;
    const ok = window.confirm(`Delete admin "${admin?.name || admin?.email}" permanently?`);
    if (!ok) return;
    try {
      setError("");
      await adminAPI.deleteManagedAdmin(admin._id);
      if (editingAdminId === admin._id) {
        handleCancelEdit();
      }
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to delete admin");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">Manage Admins</h1>
        <p className="text-sm text-gray-600 mt-1">
          Create super admin or sub admin accounts, assign sidebar access and zones.
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {!isSuperAdmin ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          Only super admin can create or edit admins.
        </div>
      ) : (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Create Admin</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={form.adminType}
              onChange={(e) => setForm((p) => ({ ...p, adminType: e.target.value }))}
            >
              <option value="SUB_ADMIN">Sub Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          {isSubAdminForm ? (
            <>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Sidebar Permissions</h3>
                <div className="max-h-56 overflow-auto border rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((opt) => (
                    <label key={opt.path} className="flex items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedPermissionsSet.has(opt.path)}
                        onChange={() => togglePermission(opt.path)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Assigned Zones</h3>
                <div className="max-h-44 overflow-auto border rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {zones.map((zone) => {
                    const id = zone?._id || zone?.id;
                    if (!id) return null;
                    const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id;
                    return (
                      <label key={id} className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedZoneSet.has(id)}
                          onChange={() => toggleZone(id)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Admin"}
          </button>
        </form>
      )}

      {isSuperAdmin && editingAdminId ? (
        <form onSubmit={handleSaveEdit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Edit Admin</h2>
            <button type="button" className="text-sm text-gray-500" onClick={handleCancelEdit}>Cancel</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Name"
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Phone"
              value={editForm.phone}
              onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="New Password (optional)"
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={editForm.adminType}
              onChange={(e) => setEditForm((p) => ({ ...p, adminType: e.target.value }))}
            >
              <option value="SUB_ADMIN">Sub Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          {editForm.adminType === "SUB_ADMIN" ? (
            <>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Sidebar Permissions</h3>
                <div className="max-h-56 overflow-auto border rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((opt) => (
                    <label key={opt.path} className="flex items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedEditPermissionsSet.has(opt.path)}
                        onChange={() => toggleEditPermission(opt.path)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Assigned Zones</h3>
                <div className="max-h-44 overflow-auto border rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {zones.map((zone) => {
                    const id = zone?._id || zone?.id;
                    if (!id) return null;
                    const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id;
                    return (
                      <label key={id} className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedEditZoneSet.has(id)}
                          onChange={() => toggleEditZone(id)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Existing Admins</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading admins...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-gray-500">No admins found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Permissions</th>
                  <th className="py-2 pr-4">Zones</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => {
                  const isActive = admin?.isActive !== false;
                  const zoneCount = Array.isArray(admin?.zoneIds) ? admin.zoneIds.length : 0;
                  const permissionCount = Array.isArray(admin?.permissions) ? admin.permissions.length : 0;
                  return (
                    <tr key={admin?._id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{admin?.name || "-"}</td>
                      <td className="py-2 pr-4">{admin?.email || "-"}</td>
                      <td className="py-2 pr-4">{admin?.adminType || "SUPER_ADMIN"}</td>
                      <td className="py-2 pr-4">{permissionCount}</td>
                      <td className="py-2 pr-4">{zoneCount}</td>
                      <td className="py-2 pr-4">{isActive ? "Active" : "Inactive"}</td>
                      <td className="py-2">
                        {isSuperAdmin ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(admin)}
                              className="px-3 py-1 rounded-md border text-xs"
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(admin)}
                              className="px-3 py-1 rounded-md border text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAdmin(admin)}
                              disabled={(admin?._id || null) === currentAdminId}
                              className="px-3 py-1 rounded-md border text-xs text-red-600 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
