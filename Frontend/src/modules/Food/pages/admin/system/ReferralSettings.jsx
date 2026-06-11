import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { adminAPI } from "@food/api";
import { toast } from "sonner";

const debugError = (...args) => {};

export default function ReferralSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    referralRewardUser: "",
    referralRewardReferredUser: "",
  });

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getReferralSettings();
      const data = res?.data?.data?.referralSettings || res?.data?.referralSettings || {};
      setForm({
        referralRewardUser:
          data?.referralRewardUser !== undefined && data?.referralRewardUser !== null
            ? String(data.referralRewardUser)
            : "0",
        referralRewardReferredUser:
          data?.referralRewardReferredUser !== undefined && data?.referralRewardReferredUser !== null
            ? String(data.referralRewardReferredUser)
            : "0",
      });
    } catch (error) {
      debugError("Failed to load referral settings:", error);
      toast.error(error?.response?.data?.message || "Failed to load referral settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const onChange = (key, value) => {
    const next = String(value || "").replace(/[^\d]/g, "");
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    const payload = {
      referralRewardUser: Number(form.referralRewardUser || 0),
      referralRewardReferredUser: Number(form.referralRewardReferredUser || 0),
    };
    if (Object.values(payload).some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error("All values must be 0 or more");
      return;
    }

    try {
      setSaving(true);
      await adminAPI.updateReferralSettings(payload);
      toast.success("Referral settings saved");
      await loadSettings();
    } catch (error) {
      debugError("Failed to save referral settings:", error);
      toast.error(error?.response?.data?.message || "Failed to save referral settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Gift className="w-5 h-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Refer & Earn Settings</h1>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Set user referral rewards: one for the user who shares code and one for the new user who applies it.
          </p>

          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
            </div>
          ) : (
            <form onSubmit={onSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Referrer Reward (INR)
                </label>
                <input
                  type="text"
                  value={form.referralRewardUser}
                  onChange={(e) => onChange("referralRewardUser", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Referred User Reward (INR)
                </label>
                <input
                  type="text"
                  value={form.referralRewardReferredUser}
                  onChange={(e) => onChange("referralRewardReferredUser", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="md:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Settings
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
