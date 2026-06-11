> *Hand this whole document to any IDE / AI assistant.* It explains the root cause and
> gives the exact, ordered changes to replicate the fix in a similar project (admin "draw a
> delivery zone on a map" feature, or any polygon-drawing-on-Google-Maps screen).

---

## 1. The Problem (Root Cause)

Google *retired google.maps.drawing.DrawingManager*. The library still appears to load,
but the moment you call new google.maps.drawing.DrawingManager(...) it throws:


Error: The DrawingManager functionality in the Maps JavaScript API is no longer available.


Symptoms users see:

- The *"Start Drawing" button does nothing* (silent no-op) because the DrawingManager
  instance was never created, so the click handler returns early.
- It may look like a "library not loading" bug, but *reloading libraries will never fix it* —
  the API itself is gone. Confirm by checking the browser *Console* for the error above.

*Secondary issue in many codebases:* other pages load the Google Maps script with only
libraries=places. Google Maps JS is a *singleton* — once loaded, you cannot reliably add
more libraries (drawing/geometry) to the same instance. So even before the retirement,
drawing was often missing.

*Conclusion:* Stop using DrawingManager. Implement manual polygon drawing with the core
Maps API (which is *not* deprecated). This also removes the dependency on the drawing
library entirely.

---

## 2. The Solution (High Level)

Replace DrawingManager with *click-to-draw*:

1. User clicks *Start Drawing* → cursor becomes a crosshair, a map click listener becomes active.
2. Each map click pushes a vertex; a live preview polygon + vertex dots are redrawn on every click.
3. Enforce *min 3 / max 10* points (configurable).
4. *Order points radially* (by angle around their centroid) so edges never self-intersect,
   while *keeping every clicked point* (do NOT use a convex hull — it silently drops points
   that fall inside the shape).
5. User clicks *Finish Drawing* → finalize into an *editable* polygon (Google's native white
   square vertex handles let the user drag/adjust — exactly like the old DrawingManager felt).
6. Save only the *coordinates* (array of {latitude, longitude}) to the backend — same format
   as before. *No area number is computed on the frontend* (it never was).

Backend zone detection (ray-casting point-in-polygon) only needs correctly-ordered,
non-self-intersecting coordinates — which radial ordering guarantees. So this fix actually makes
detection *more* reliable.

---

## 3. Exact Changes (Step by Step)

### Step 0 — Remove the dead dependency usage
- Remove any import { Loader } from "@googlemaps/js-api-loader" if it's only used for drawing.
- Remove every reference to drawingManagerRef, DrawingManager, OverlayType.POLYGON,
  and the overlaycomplete listener.

### Step 1 — Loader: only load places + geometry (NOT drawing)
We no longer need drawing. Reuse any existing Maps script; if none exists, inject one.

js
const loadGoogleMaps = async () => {
  const apiKey = await getGoogleMapsApiKey();
  if (!apiKey) { setMapLoading(false); return; }

  const existingScript = Array.from(document.getElementsByTagName("script"))
    .find(s => s.src?.includes("maps.googleapis.com/maps/api/js"));

  if (!window.google?.maps && !existingScript) {
    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = "google-maps-sdk";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&v=weekly`;
      script.async = true; script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  // Poll until the core maps object exists (loaded by us or another page).
  const ready = await waitFor(() => !!window.google?.maps);
  if (!ready) { setMapLoading(false); return; }
  initializeMap(window.google);
};

// Helper: poll a predicate up to timeoutMs.
const waitFor = async (predicate, timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return predicate();
};


### Step 2 — Add module-level constants + radial ordering helper

js
const MIN_POINTS = 3;
const MAX_POINTS = 10;

// Order points by angle around their centroid so polygon edges never self-intersect,
// while KEEPING every clicked point (unlike a convex hull). Accepts LatLng or {lat,lng}.
const orderPointsRadially = (pts) => {
  const points = pts
    .map(p => ({
      lat: typeof p.lat === 'function' ? p.lat() : p.lat,
      lng: typeof p.lng === 'function' ? p.lng() : p.lng,
    }))
    .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');

  if (points.length < 3) return points;

  const cx = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.lat, 0) / points.length;

  return [...points].sort((a, b) =>
    Math.atan2(a.lat - cy, a.lng - cx) - Math.atan2(b.lat - cy, b.lng - cx)
  );
};


### Step 3 — Refs for manual drawing state
Replace drawingManagerRef with:

js
const mapClickListenerRef = useRef(null);
const drawPointsRef = useRef([]);   // raw clicked LatLngs
const isDrawingRef = useRef(false);  // ref (not state) so the click closure reads the live value
const polygonRef = useRef(null);
const pathMarkersRef = useRef([]);


### Step 4 — Map options: stop POI labels from swallowing clicks
This is critical. Without it, tapping on a restaurant/place label opens Google's info window
*instead of adding a point*, so it looks like "I can't add more points."

js
const map = new google.maps.Map(mapRef.current, {
  // ...your existing options...
  clickableIcons: false, // POI labels must NOT capture clicks while drawing
});


### Step 5 — Map click listener (add a vertex per click, enforce max)

js
mapClickListenerRef.current = google.maps.event.addListener(map, 'click', (event) => {
  if (!isDrawingRef.current) return;
  if (drawPointsRef.current.length >= MAX_POINTS) {
    alert(`You can add at most ${MAX_POINTS} points. Click "Finish Drawing" to complete.`);
    return;
  }
  drawPointsRef.current.push(event.latLng);
  renderDrawingPolygon(google, map);
});


### Step 6 — Live preview render (radially ordered, markers NON-clickable)

js
const renderVertexMarkers = (google, map, latLngs) => {
  pathMarkersRef.current?.forEach(m => m.setMap(null));
  pathMarkersRef.current = latLngs.map((latLng, i) => new google.maps.Marker({
    position: latLng,
    map,
    clickable: false, // must not block map clicks
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#9333ea",
            fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
    zIndex: 1000,
    title: `Point ${i + 1}`,
  }));
};

const renderDrawingPolygon = (google, map) => {
  const points = drawPointsRef.current;
  if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }

  const ordered = points.length >= 3
    ? orderPointsRadially(points)
    : points.map(p => ({ lat: p.lat(), lng: p.lng() }));

  if (ordered.length >= 2) {
    polygonRef.current = new google.maps.Polygon({
      paths: ordered, fillColor: "#9333ea", fillOpacity: 0.35,
      strokeColor: "#9333ea", strokeWeight: 2,
      clickable: false, editable: false, zIndex: 1,
    });
    polygonRef.current.setMap(map);
  }

  renderVertexMarkers(google, map, points);
  setCoordinates(ordered.map(p => ({
    latitude: parseFloat(p.lat.toFixed(6)),
    longitude: parseFloat(p.lng.toFixed(6)),
  })));
};


### Step 7 — Finish drawing → editable polygon (NO extra markers on top)

The finalized polygon must be editable: true and have *no circle markers covering it*,
because extra markers intercept the mouse and block the native white drag-handles.

js
const finishDrawing = () => {
  const google = window.google, map = mapInstanceRef.current;
  if (!google || !map) return;

  const points = drawPointsRef.current;
  if (points.length < MIN_POINTS) {
    alert(`Please click at least ${MIN_POINTS} points on the map.`);
    return false;
  }

  if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
  pathMarkersRef.current?.forEach(m => m.setMap(null));
  pathMarkersRef.current = [];

  const ordered = orderPointsRadially(points);
  const coords = ordered.map(p => ({
    latitude: parseFloat(p.lat.toFixed(6)),
    longitude: parseFloat(p.lng.toFixed(6)),
  }));
  setCoordinates(coords);
  drawEditablePolygon(google, map, coords); // creates editable polygon + path listeners, NO markers
  return true;
};

// Editable polygon. On vertex drag/add/remove, sync coordinates from the path.
const drawEditablePolygon = (google, map, coords) => {
  const path = coords.map(c => new google.maps.LatLng(c.latitude, c.longitude));
  const polygon = new google.maps.Polygon({
    paths: path, strokeColor: "#9333ea", strokeOpacity: 0.8, strokeWeight: 3,
    fillColor: "#9333ea", fillOpacity: 0.35,
    editable: true, draggable: false, clickable: false,
  });
  polygon.setMap(map);
  polygonRef.current = polygon;
  pathMarkersRef.current = []; // IMPORTANT: no circle markers — they block the drag handles

  const sync = () => {
    const p = polygon.getPath();
    const out = [];
    p.forEach(ll => out.push({ latitude: ll.lat(), longitude: ll.lng() }));
    setCoordinates(out);
  };
  const pp = polygon.getPath();
  google.maps.event.addListener(pp, 'set_at', sync);
  google.maps.event.addListener(pp, 'insert_at', sync);
  google.maps.event.addListener(pp, 'remove_at', sync);
};


### Step 8 — Toggle button handler (start / finish) + crosshair + existing zones

js
const toggleDrawingMode = () => {
  const google = window.google, map = mapInstanceRef.current;
  if (!google || !map) { alert("Map is still loading."); return; }

  if (isDrawing) {                       // FINISH
    if (finishDrawing() === false) return; // not enough points → stay in drawing mode
    isDrawingRef.current = false;
    setIsDrawing(false);
    map.setOptions({ draggableCursor: null });
    existingZonesPolygonsRef.current.forEach(p => p?.setOptions?.({ clickable: true }));
  } else {                               // START
    clearDrawing();
    drawPointsRef.current = [];
    isDrawingRef.current = true;
    setIsDrawing(true);
    map.setOptions({ draggableCursor: 'crosshair' });
    // make other zones non-clickable so taps over them add points, not open info windows
    existingZonesPolygonsRef.current.forEach(p => p?.setOptions?.({ clickable: false }));
  }
};

const clearDrawing = () => {
  drawPointsRef.current = [];
  if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
  pathMarkersRef.current?.forEach(m => m.setMap(null));
  pathMarkersRef.current = [];
  setCoordinates([]);
};


### Step 9 — Button label + hint text

jsx
<button onClick={toggleDrawingMode}>
  {isDrawing ? "Finish Drawing" : "Start Drawing"}
</button>

{isDrawing && (
  <p>Click on the map to add points ({MIN_POINTS}–{MAX_POINTS}), then click <b>Finish Drawing</b>.</p>
)}


### Step 10 — Places search (optional, if you have a location search box)
The DrawingManager retirement does NOT affect Places. Keep Autocomplete but:
- Load via libraries=places (Step 1 covers this).
- The suggestion dropdown .pac-container can render *behind* the map — fix with a one-time
  injected style: '.pac-container { z-index: 10000 !important; }'.

---

## 4. What is sent to the backend (UNCHANGED)

Only the vertices, in the SAME format as before. No area, no derived fields:

js
const zoneData = {
  name: zoneName,
  country,
  unit,
  coordinates,   // [{ latitude, longitude }, ...]  (>= 3, radially ordered)
  isActive: true,
};


Backend zone detection stays the same — *ray-casting point-in-polygon*, which only needs the
ordered coordinates. Example (Node):

js
const isPointInPolygon = (lat, lng, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude, yi = polygon[i].latitude;
    const xj = polygon[j].longitude, yj = polygon[j].latitude;
    const intersect = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};


Because the polygon is now guaranteed non-self-intersecting, this detection is *more accurate*
than before.

---

## 5. Gotchas / Checklist (verify each)

- [ ] *Console shows the retirement error before the fix* — confirms this is the right diagnosis.
- [ ] clickableIcons: false on the map — otherwise POI taps "eat" clicks and you can't add points.
- [ ] Vertex circle markers are clickable: false (preview) and *absent* on the finalized polygon.
- [ ] Finalized polygon is editable: true so users can drag the native white handles.
- [ ] Use isDrawingRef (a ref) inside the map click closure — React state would be stale there.
- [ ] *Radial order, not convex hull* — hull silently drops interior points (looks like "can't add more").
- [ ] Existing zones set to clickable:false while drawing, restored after.
- [ ] No @googlemaps/js-api-loader requirement; plain script injection works and avoids
      "Loader must not be called again with different options".
- [ ] Edit mode: when loading a saved zone, draw it with the same editable polygon path
      (reuse drawEditablePolygon), and ensure drawing mode is off.

---

## 6. One-line summary for a PR / commit

> Replace retired Google Maps DrawingManager with manual click-to-draw polygon editing
> (radially-ordered vertices, 3–10 points, editable handles, clickableIcons:false); zone
> coordinate payload and backend point-in-polygon detection unchanged.