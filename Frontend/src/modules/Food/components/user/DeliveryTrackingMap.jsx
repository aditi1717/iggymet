import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  GoogleMap, 
  useJsApiLoader, 
  OverlayView, 
  DirectionsService, 
  Polyline
} from '@react-google-maps/api';
import io from 'socket.io-client';
import { API_BASE_URL } from '@food/api/config';
import { subscribeOrderTracking } from '@food/realtimeTracking';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation } from 'lucide-react';

const LIBRARIES = ['geometry', 'places'];

const RESTAURANT_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;

const CUSTOMER_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;

const MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
];

const debugLog = (...args) => console.log('[DeliveryTrackingMap]', ...args);

const DeliveryTrackingMap = ({
  orderId,
  orderTrackingIds = [],
  restaurantCoords,
  customerCoords,
  order = null,
  onEtaUpdate = null
}) => {
  const [map, setMap] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [directions, setDirections] = useState(null);
  const [baselineDirections, setBaselineDirections] = useState(null);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);
  const [currentEta, setCurrentEta] = useState(null);
  const [cloudPolyline, setCloudPolyline] = useState(null);
  const [smoothLocation, setSmoothLocation] = useState(null);
  const socketRef = useRef(null);
  const interpStateRef = useRef({ lastPos: null, nextPos: null, startTime: 0 });
  const latestRiderLocationRef = useRef(null);
  const latestSmoothLocationRef = useRef(null);
  const lastCameraPanRef = useRef({ time: 0, status: null });
  const initialBoundsSetRef = useRef(false);
  const updateCountRef = useRef(0);

  useEffect(() => {
    latestRiderLocationRef.current = riderLocation;
  }, [riderLocation]);

  useEffect(() => {
    latestSmoothLocationRef.current = smoothLocation;
  }, [smoothLocation]);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  // Build unique tracking IDs
  const trackingIdsStr = useMemo(() => {
    const ids = [orderId, ...(Array.isArray(orderTrackingIds) ? orderTrackingIds : [])]
      .map(id => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(ids)].sort().join(',');
  }, [orderId, orderTrackingIds]);

  const backendUrl = useMemo(() => {
    return (API_BASE_URL || '').replace(/\/api\/v1\/?$/i, '').replace(/\/api\/?$/i, '');
  }, []);

  // Helper: trigger smooth interpolation from ANY source
  const triggerSmoothMove = useCallback((nextPos) => {
    const currentPos = latestSmoothLocationRef.current || latestRiderLocationRef.current;
    interpStateRef.current = {
      lastPos: currentPos || nextPos,
      nextPos: nextPos,
      startTime: Date.now()
    };
    setRiderLocation(nextPos);
    updateCountRef.current += 1;
  }, []);

  // 1. Initial State from Order Payload (multiple fallbacks)
  useEffect(() => {
    if (riderLocation) return; // Already have location
    
    // Try deliveryState.currentLocation
    const loc = order?.deliveryState?.currentLocation;
    if (loc) {
      const lat = typeof loc.lat === 'number' ? loc.lat : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[1]) : null);
      const lng = typeof loc.lng === 'number' ? loc.lng : (Array.isArray(loc.coordinates) ? Number(loc.coordinates[0]) : null);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        debugLog('📍 Initial rider location from deliveryState.currentLocation');
        triggerSmoothMove({ lat, lng, heading: loc.bearing || loc.heading || 0 });
        return;
      }
    }
    
    // Try lastRiderLocation
    const lastLoc = order?.lastRiderLocation;
    if (lastLoc) {
      const lat = typeof lastLoc.lat === 'number' ? lastLoc.lat : (Array.isArray(lastLoc.coordinates) ? Number(lastLoc.coordinates[1]) : null);
      const lng = typeof lastLoc.lng === 'number' ? lastLoc.lng : (Array.isArray(lastLoc.coordinates) ? Number(lastLoc.coordinates[0]) : null);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        debugLog('📍 Initial rider location from lastRiderLocation');
        triggerSmoothMove({ lat, lng, heading: lastLoc.bearing || lastLoc.heading || 0 });
        return;
      }
    }

    // Try deliveryState.boyLocation
    const boyLoc = order?.deliveryState?.boyLocation;
    if (boyLoc) {
      const lat = Number(boyLoc.lat ?? boyLoc.boy_lat);
      const lng = Number(boyLoc.lng ?? boyLoc.boy_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        debugLog('📍 Initial rider location from deliveryState.boyLocation');
        triggerSmoothMove({ lat, lng, heading: Number(boyLoc.heading || 0) });
      }
    }
  }, [order, riderLocation, triggerSmoothMove]);

  // 2. Core Data Sync (Socket + Firebase) — ALL updates go through triggerSmoothMove
  useEffect(() => {
    const ids = trackingIdsStr.split(',').filter(Boolean);
    if (!ids.length) return;

    debugLog('🔌 Subscribing to tracking IDs:', ids);

    // A. FIREBASE REALTIME (persistent fallback)
    const unsubs = ids.map(id => subscribeOrderTracking(id, (data) => {
      const lat = Number(data?.lat ?? data?.boy_lat);
      const lng = Number(data?.lng ?? data?.boy_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const heading = Number(data?.heading ?? data?.bearing ?? 0);
        debugLog('🔥 Firebase location update:', { lat, lng, heading });
        triggerSmoothMove({ lat, lng, heading });
      }

      // Sync Cloud Polyline
      if (data?.polyline) {
        debugLog('📦 Received Cloud Polyline');
        setCloudPolyline(data.polyline);
      }
      // Sync ETA
      if (data?.eta) {
        debugLog('⏱️ Received ETA:', data.eta);
        setCurrentEta(data.eta);
        if (onEtaUpdate) onEtaUpdate(data.eta);
      }
    }));

    // B. SOCKET.IO REALTIME (low-latency live stream)
    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken') || '';
    socketRef.current = io(backendUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      debugLog('🔌 Socket connected, joining tracking rooms:', ids);
      ids.forEach(id => socketRef.current.emit('join-tracking', id));
    });

    socketRef.current.on('location-update', (data) => {
      const matchedId = ids.find(id => String(id) === String(data.orderId));
      if (data && matchedId && typeof data.lat === 'number') {
        const nextPos = {
          lat: data.lat,
          lng: data.lng,
          heading: data.heading || data.bearing || 0
        };
        debugLog('⚡ Socket location update:', nextPos);
        triggerSmoothMove(nextPos);
      }
    });

    socketRef.current.on('disconnect', (reason) => {
      debugLog('🔌 Socket disconnected:', reason);
    });

    return () => {
      unsubs.forEach(u => u?.());
      socketRef.current?.disconnect();
    };
  }, [trackingIdsStr, backendUrl, triggerSmoothMove, onEtaUpdate]);

  // 3. Smooth Animation Loop (60 FPS Glide — Swiggy/Ola style)
  useEffect(() => {
    let frame;
    const update = () => {
      const { lastPos, nextPos, startTime } = interpStateRef.current;
      if (lastPos && nextPos) {
        const duration = 3000; // 3s glide between updates
        const elapsed = Date.now() - startTime;
        // Ease-out cubic for natural deceleration
        const rawProgress = Math.min(elapsed / duration, 1);
        const progress = 1 - Math.pow(1 - rawProgress, 3);
        
        const lat = lastPos.lat + (nextPos.lat - lastPos.lat) * progress;
        const lng = lastPos.lng + (nextPos.lng - lastPos.lng) * progress;
        
        // Heading interpolation (shortest arc)
        let lastHead = lastPos.heading || 0;
        let nextHead = nextPos.heading || 0;
        let diff = nextHead - lastHead;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        const heading = (lastHead + diff * progress + 360) % 360;

        setSmoothLocation({ lat, lng, heading });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const displayRiderLocation = smoothLocation || riderLocation;

  const tripStatus = order?.status || order?.orderStatus || 'pending';
  const isOrderPickedUp = ['picked_up', 'out_for_delivery', 'delivered'].includes(tripStatus.toLowerCase());

  // 4. Smart Camera (Swiggy-style: initial fitBounds, then smooth panTo)
  useEffect(() => {
    if (!map || !isLoaded || !restaurantCoords || !customerCoords) return;

    // Initial bounds: show the full journey once
    if (!initialBoundsSetRef.current) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(restaurantCoords);
      bounds.extend(customerCoords);
      if (riderLocation) bounds.extend(riderLocation);
      map.fitBounds(bounds, { top: 80, bottom: 100, left: 50, right: 50 });
      initialBoundsSetRef.current = true;
      return;
    }

    // After initial, smoothly pan to follow rider (throttled, not on every frame)
    if (!displayRiderLocation) return;
    
    const now = Date.now();
    const statusChanged = lastCameraPanRef.current.status !== isOrderPickedUp;
    const timeSinceLastPan = now - lastCameraPanRef.current.time;

    // Re-fit bounds on status change (pickup → delivery transition)
    if (statusChanged) {
      lastCameraPanRef.current = { time: now, status: isOrderPickedUp };
      const bounds = new window.google.maps.LatLngBounds();
      if (isOrderPickedUp) {
        bounds.extend(displayRiderLocation);
        bounds.extend(customerCoords);
      } else {
        bounds.extend(displayRiderLocation);
        bounds.extend(restaurantCoords);
      }
      map.fitBounds(bounds, { top: 80, bottom: 100, left: 50, right: 50 });
      return;
    }

    // Smooth panTo every 8 seconds (not fitBounds — avoids zoom flickering)
    if (timeSinceLastPan > 8000) {
      lastCameraPanRef.current = { time: now, status: isOrderPickedUp };
      
      // Check if rider is near edge of visible map
      const mapBounds = map.getBounds();
      if (mapBounds) {
        const riderLatLng = new window.google.maps.LatLng(displayRiderLocation.lat, displayRiderLocation.lng);
        if (!mapBounds.contains(riderLatLng)) {
          // Rider went off-screen, re-fit
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(displayRiderLocation);
          const dest = isOrderPickedUp ? customerCoords : restaurantCoords;
          bounds.extend(dest);
          map.fitBounds(bounds, { top: 80, bottom: 100, left: 50, right: 50 });
        } else {
          // Gentle pan toward rider
          map.panTo(displayRiderLocation);
        }
      }
    }
  }, [map, displayRiderLocation, restaurantCoords, customerCoords, isOrderPickedUp, isLoaded, riderLocation]);

  // 5. Compute remaining path (trim polyline from rider to destination — like LiveMap.jsx)
  const remainingPath = useMemo(() => {
    if (!directions || !displayRiderLocation || !window.google) return [];
    try {
      const fullPath = directions.routes[0].overview_path;
      if (!fullPath || fullPath.length === 0) return [];
      
      let closestIndex = 0;
      let minDist = Infinity;
      const rPos = new window.google.maps.LatLng(displayRiderLocation.lat, displayRiderLocation.lng);
      
      for (let i = 0; i < fullPath.length; i++) {
        const d = window.google.maps.geometry.spherical.computeDistanceBetween(rPos, fullPath[i]);
        if (d < minDist) { minDist = d; closestIndex = i; }
      }
      
      return [
        { lat: displayRiderLocation.lat, lng: displayRiderLocation.lng },
        ...fullPath.slice(closestIndex + 1)
      ];
    } catch (e) {
      return [];
    }
  }, [directions, displayRiderLocation]);

  // 6. Directions Management
  const directionsCallback = useCallback((result, status) => {
    if (status === 'OK' && result) {
      setDirections(result);
      setLastDirectionsAt(Date.now());
      
      const durationText = result?.routes?.[0]?.legs?.[0]?.duration?.text;
      if (durationText) {
        setCurrentEta(durationText);
        if (onEtaUpdate) onEtaUpdate(durationText);
      }
    }
  }, [onEtaUpdate]);

  const shouldUpdateRoute = useMemo(() => {
    if (!directions) return true;
    return Date.now() - lastDirectionsAt > 20000;
  }, [directions, lastDirectionsAt]);

  const directionsServiceOptions = useMemo(() => {
    if (!riderLocation) return null;
    const dest = isOrderPickedUp ? customerCoords : restaurantCoords;
    if (!dest) return null;
    return {
      origin: riderLocation,
      destination: dest,
      travelMode: 'DRIVING'
    };
  }, [riderLocation?.lat, riderLocation?.lng, isOrderPickedUp, restaurantCoords?.lat, restaurantCoords?.lng, customerCoords?.lat, customerCoords?.lng]);

  const center = useMemo(() => {
    if (isOrderPickedUp) return customerCoords || { lat: 0, lng: 0 };
    return restaurantCoords || { lat: 0, lng: 0 };
  }, [isOrderPickedUp, restaurantCoords, customerCoords]);

  const baselineDirectionsServiceOptions = useMemo(() => {
    if (!restaurantCoords || !customerCoords) return null;
    return {
      origin: restaurantCoords,
      destination: customerCoords,
      travelMode: 'DRIVING'
    };
  }, [restaurantCoords?.lat, restaurantCoords?.lng, customerCoords?.lat, customerCoords?.lng]);

  if (!isLoaded) return <div className="w-full h-full bg-gray-100 animate-pulse" />;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl shadow-inner border border-gray-100">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={15}
        onLoad={setMap}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          styles: MAP_STYLES
        }}
      >
        {/* ── BASELINE ROUTE (Dotted: Restaurant → Customer) ── */}
        {!baselineDirections && baselineDirectionsServiceOptions && (
           <DirectionsService
             options={baselineDirectionsServiceOptions}
             callback={(r, s) => { 
                if (s === 'OK' && r) {
                    setBaselineDirections(r); 
                }
             }}
           />
        )}

        {baselineDirections && (
          <Polyline
            path={baselineDirections.routes[0].overview_path}
            options={{
              strokeColor: '#94a3b8', 
              strokeOpacity: 0,
              strokeWeight: 4,
              zIndex: 1,
              icons: [{
                icon: { 
                  path: 'M 0,-1 0,1', 
                  strokeOpacity: 0.35, 
                  scale: 3, 
                  strokeWeight: 4,
                  strokeColor: '#64748b'
                },
                offset: '0',
                repeat: '15px'
              }]
            }}
          />
        )}

        {/* ── LIVE ROUTE (Cloud Polyline from driver's app) ── */}
        {cloudPolyline && window.google?.maps?.geometry?.encoding && (
          <Polyline
            path={(() => {
              try {
                return window.google.maps.geometry.encoding.decodePath(
                  typeof cloudPolyline === 'string' ? cloudPolyline : (cloudPolyline.points || '')
                );
              } catch { return []; }
            })()}
            options={{
              strokeColor: isOrderPickedUp ? '#3b82f6' : '#22c55e',
              strokeWeight: 6,
              strokeOpacity: 1,
              zIndex: 10
            }}
          />
        )}

        {/* ── LIVE ROUTE (Directions API fallback — fetch route) ── */}
        {!cloudPolyline && directionsServiceOptions && shouldUpdateRoute && (
          <DirectionsService
            options={directionsServiceOptions}
            callback={directionsCallback}
          />
        )}

        {/* ── REMAINING PATH (Trimmed from rider position — Ola/Swiggy style) ── */}
        {!cloudPolyline && remainingPath.length > 0 && (
          <Polyline
            path={remainingPath}
            options={{
              strokeColor: isOrderPickedUp ? '#3b82f6' : '#22c55e',
              strokeWeight: 6,
              strokeOpacity: 0.9,
              zIndex: 10
            }}
          />
        )}

        {/* ── TRAVERSED PATH (Faded — shows what rider already covered) ── */}
        {!cloudPolyline && directions && (
          <Polyline
            path={directions.routes[0].overview_path}
            options={{
              strokeColor: '#94a3b8',
              strokeOpacity: 0,
              strokeWeight: 4,
              zIndex: 2,
              icons: [{
                icon: { 
                  path: 'M 0,-1 0,1', 
                  strokeOpacity: 0.25, 
                  scale: 3, 
                  strokeWeight: 4,
                  strokeColor: '#94a3b8'
                },
                offset: '0',
                repeat: '15px'
              }]
            }}
          />
        )}

        {/* ── RESTAURANT PIN ── */}
        <OverlayView
          position={restaurantCoords}
          mapPaneName={OverlayView.MARKER_LAYER}
        >
          <div className="relative -translate-x-1/2 -translate-y-full mb-1 group">
             {!isOrderPickedUp && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                 <motion.div 
                   animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="w-16 h-16 rounded-full border-4 border-orange-500/50"
                 />
               </div>
             )}
             <div className="relative w-11 h-11 rounded-full p-1 bg-white shadow-xl border-2 border-orange-500 overflow-hidden group-hover:scale-110 transition-transform">
                <img 
                  src={order?.restaurantLogo || order?.restaurantId?.logo || order?.restaurantId?.profileImage || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RESTAURANT_PIN_SVG)}`}
                  alt="Restaurant"
                  className="w-full h-full object-contain rounded-full bg-gray-50"
                  onError={(e) => { e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(RESTAURANT_PIN_SVG)}`; }}
                />
             </div>
             <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-3 h-3 bg-orange-500 rotate-180 -mt-1 shadow-sm" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
          </div>
        </OverlayView>

        {/* ── CUSTOMER PIN ── */}
        <OverlayView
          position={customerCoords}
          mapPaneName={OverlayView.MARKER_LAYER}
        >
          <div className="relative -translate-x-1/2 -translate-y-full mb-1 group">
             {isOrderPickedUp && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                 <motion.div 
                   animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="w-16 h-16 rounded-full border-4 border-green-500/50"
                 />
               </div>
             )}
             <div className="relative w-11 h-11 rounded-full p-1 bg-white shadow-xl border-2 border-green-500 overflow-hidden group-hover:scale-110 transition-transform">
                <img 
                  src={order?.customerImage || order?.userId?.profileImage || order?.userId?.avatar || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`}
                  alt="Me"
                  className="w-full h-full object-contain rounded-full bg-gray-50"
                  onError={(e) => { e.target.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CUSTOMER_PIN_SVG)}`; }}
                />
             </div>
             <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 rotate-180 -mt-1 shadow-sm" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
          </div>
        </OverlayView>

        {/* ── RIDER PULSING RING (Swiggy/Ola style — separate layer below) ── */}
        {displayRiderLocation && (
          <OverlayView
            position={displayRiderLocation}
            mapPaneName={OverlayView.OVERLAY_LAYER}
          >
            <div style={{ transform: 'translate(-50%, -50%)' }} className="pointer-events-none">
              <motion.div
                animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                className="w-[80px] h-[80px] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,129,0,0.4) 0%, rgba(255,129,0,0) 70%)' }}
              />
            </div>
          </OverlayView>
        )}

        {/* ── RIDER MARKER (MapRider.png — EXACT same as delivery feed LiveMap.jsx) ── */}
        {displayRiderLocation && (
          <OverlayView position={displayRiderLocation} mapPaneName={OverlayView.MARKER_LAYER}>
            <div style={{ transform: `translate(-50%, -50%) rotate(${displayRiderLocation.heading || 0}deg)`, transition: 'transform 0.5s linear' }} className="relative w-[72px] h-[72px]">
              <img src="/MapRider.png" alt="Rider" className="w-full h-full object-contain" />
            </div>
          </OverlayView>
        )}
      </GoogleMap>

      {/* ── LIVE ARRIVAL BADGE ── */}
      <AnimatePresence>
        {riderLocation && currentEta && (
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="absolute top-4 left-4 z-[150] pointer-events-none"
          >
            <div className="bg-orange-500/95 backdrop-blur-xl rounded-2xl p-3 shadow-[0_10px_30px_rgba(249,115,22,0.4)] border border-orange-400/50 flex flex-col min-w-[90px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
              <div className="flex flex-col z-10">
                <span className="text-[9px] text-white/80 font-black uppercase tracking-[0.2em] mb-0.5">Arrival</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white leading-none tracking-tighter">
                    {currentEta}
                  </span>
                  <div className="flex items-center gap-1.5 opacity-80">
                     <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                     <Navigation className="w-3 h-3 text-white rotate-45" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LIVE INDICATOR DOT (bottom-right) ── */}
      <AnimatePresence>
        {riderLocation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute bottom-4 right-4 z-[150] pointer-events-none"
          >
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg border border-gray-200/50">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-green-500"
              />
              <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Live</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeliveryTrackingMap;
