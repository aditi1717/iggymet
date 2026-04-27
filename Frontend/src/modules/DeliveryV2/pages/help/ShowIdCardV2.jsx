import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2, ShieldCheck, Phone, CreditCard, Truck } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { useCompanyName } from "@food/hooks/useCompanyName";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

export default function ShowIdCardV2() {
  const companyName = useCompanyName();
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  // Fetch delivery partner profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getProfile();
        
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfileData(response.data.data.profile);
        } else {
          toast.error("Failed to load profile data");
        }
      } catch (error) {
        toast.error("Failed to load ID card data");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Format date for validity
  const formatValidDate = () => {
    if (!profileData?.createdAt) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const createdDate = new Date(profileData.createdAt);
    const validTill = new Date(createdDate);
    validTill.setFullYear(validTill.getFullYear() + 1);
    return validTill.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Get status display
  const getStatusDisplay = () => {
    if (!profileData) return "Active";
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Get profile image URL
  const getProfileImageUrl = () => {
    if (profileData?.profileImage?.url) return profileData.profileImage.url;
    if (profileData?.documents?.photo) return profileData.documents.photo;
    const name = profileData?.name || "Delivery Partner";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ff8100&color=fff&size=128`;
  };

  // Get vehicle display text
  const getVehicleDisplay = () => {
    if (!profileData?.vehicle) return null;
    const vehicle = profileData.vehicle;
    const parts = [];
    if (vehicle.type) parts.push(vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1));
    if (vehicle.number) parts.push(vehicle.number.toUpperCase());
    return parts.length > 0 ? parts.join(" - ") : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-poppins">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <p className="text-gray-500 text-xs font-semibold">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-poppins px-6">
        <div className="text-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-4 w-full">
          <p className="text-gray-900 font-bold mb-1">Failed to load ID card</p>
          <p className="text-gray-500 text-xs font-medium">Please check your connection and try again.</p>
        </div>
        <button onClick={goBack} className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold w-full max-w-xs shadow-sm">
           Return to App
        </button>
      </div>
    );
  }

  const idCardData = {
    name: profileData.name || "Delivery Partner",
    id: profileData.deliveryId || profileData._id?.toString().slice(-8).toUpperCase() || "N/A",
    phone: profileData.phone || "N/A",
    status: getStatusDisplay(),
    validTill: formatValidDate(),
    vehicle: getVehicleDisplay(),
    profileImage: getProfileImageUrl()
  };

  const isStatusActive = idCardData.status.toLowerCase() === 'active' || idCardData.status.toLowerCase() === 'approved';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-poppins">
      
      {/* HEADER (Standard Compact) */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30 shadow-sm gap-3">
        <button
          onClick={goBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Virtual ID Card</h1>
      </div>

      <div className="flex-1 px-4 py-8 flex flex-col items-center max-w-sm mx-auto w-full">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4">Official Partner Identification</p>
        
        {/* ID CARD PORTRAIT CONTAINER */}
        <div className="bg-white w-full rounded-2xl shadow-lg border border-gray-100 overflow-hidden relative">
          
          {/* Card Top Brand Strip */}
          <div className="h-16 bg-gray-900 relative px-4 flex items-center justify-between overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800" />
             <div className="relative z-10">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400">{companyName}</p>
                <p className="text-[10px] text-gray-300 font-bold tracking-widest mt-0.5">AUTHORISED PERSONNEL</p>
             </div>
             <ShieldCheck className="w-6 h-6 text-white/20 relative z-10" />
          </div>

          {/* Profile Content */}
          <div className="px-5 pt-12 pb-6 relative text-center">
             {/* Profile Picture Overlay */}
             <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                <div className="w-20 h-20 bg-white rounded-full p-1 shadow-md">
                   <img 
                     src={idCardData.profileImage}
                     alt={idCardData.name}
                     className="w-full h-full rounded-full object-cover bg-gray-100"
                   />
                </div>
                {/* Status Dot */}
                <div className={`absolute bottom-1.5 right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ${isStatusActive ? 'bg-green-500' : 'bg-red-500'}`} />
             </div>

             <div className="mt-2 space-y-1">
                <h2 className="text-xl font-black text-gray-950 tracking-tight leading-none">{idCardData.name}</h2>
                <div className="inline-block mt-2">
                   <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${isStatusActive ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'} border`}>
                      {idCardData.status}
                   </span>
                </div>
             </div>

             {/* Partner Details List */}
             <div className="mt-6 text-left space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                   <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4" />
                   </div>
                   <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Partner ID</p>
                      <p className="text-sm font-black text-gray-900">{idCardData.id}</p>
                   </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                   <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                   </div>
                   <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Registered Phone</p>
                      <p className="text-sm font-black text-gray-900">{idCardData.phone}</p>
                   </div>
                </div>

                {idCardData.vehicle && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                     <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4" />
                     </div>
                     <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Vehicle details</p>
                        <p className="text-sm font-black text-gray-900">{idCardData.vehicle}</p>
                     </div>
                  </div>
                )}
             </div>

             {/* Footer validity */}
             <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider leading-relaxed">
                   Valid Till: {idCardData.validTill} <br/>
                   Issued by {companyName}
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
