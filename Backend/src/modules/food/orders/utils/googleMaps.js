import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';

async function fetchDirectionsRoute(origin, destination) {
    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
        logger.warn('Google Maps API key missing. Directions fetch skipped.');
        return null;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const originStr = `${origin.lat},${origin.lng}`;
        const destStr = `${destination.lat},${destination.lng}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&key=${apiKey}`;

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();

        if (data.status === 'OK' && data.routes?.length > 0) {
            return data.routes[0] || null;
        }

        logger.warn(`Google Directions API returned status: ${data.status}. Message: ${data.error_message || 'No routes found'}`);
    } catch (err) {
        logger.error(`Error fetching directions from Google: ${err.message}`);
    }

    return null;
}

/**
 * Fetches an encoded polyline from Google Directions API.
 * This should be called ONLY ONCE per order assignment to save costs.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<string>} - Encoded polyline points
 */
export async function fetchPolyline(origin, destination) {
    const route = await fetchDirectionsRoute(origin, destination);
    return route?.overview_polyline?.points || '';
}

export async function fetchRouteDistanceKm(origin, destination) {
    const route = await fetchDirectionsRoute(origin, destination);
    const meters = Number(route?.legs?.[0]?.distance?.value);
    if (!Number.isFinite(meters) || meters <= 0) {
        return null;
    }
    return meters / 1000;
}
