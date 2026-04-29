import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurantOutletTimings } from '../models/outletTimings.model.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_SLOTS_PER_DAY = 5;

const normalizeDay = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    const exact = DAY_NAMES.find((d) => d.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    const abbr = v.slice(0, 3).toLowerCase();
    const match = DAY_NAMES.find((d) => d.toLowerCase().startsWith(abbr));
    return match || null;
};

const normalizeTime = (value, fallback) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    // Accept "HH:mm" or "H:mm"
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const timeToMinutes = (value) => {
    const normalized = normalizeTime(value, '');
    if (!normalized) return null;
    const [hours, minutes] = normalized.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
};

const normalizeSlots = (rawSlots = [], openingFallback = '09:00', closingFallback = '22:00') => {
    const sourceSlots = Array.isArray(rawSlots) && rawSlots.length > 0
        ? rawSlots
        : [{ openingTime: openingFallback, closingTime: closingFallback }];

    if (sourceSlots.length > MAX_SLOTS_PER_DAY) {
        throw new ValidationError(`Maximum ${MAX_SLOTS_PER_DAY} slots allowed in a day`);
    }

    const normalized = sourceSlots.map((slot) => {
        const openingTime = normalizeTime(slot?.openingTime, '');
        const closingTime = normalizeTime(slot?.closingTime, '');
        if (!openingTime || !closingTime) {
            throw new ValidationError('Each slot must have valid openingTime and closingTime in HH:mm format');
        }
        const openingMinutes = timeToMinutes(openingTime);
        const closingMinutes = timeToMinutes(closingTime);
        if (openingMinutes === null || closingMinutes === null) {
            throw new ValidationError('Each slot must have valid openingTime and closingTime in HH:mm format');
        }
        if (closingMinutes === openingMinutes) {
            throw new ValidationError('Opening time and closing time cannot be same');
        }
        return {
            openingTime,
            closingTime,
            openingMinutes,
            closingMinutes,
            isOvernight: closingMinutes < openingMinutes,
        };
    });

    const expandedIntervals = normalized
        .flatMap((slot, index) => {
            const endMinutes = slot.isOvernight ? slot.closingMinutes + (24 * 60) : slot.closingMinutes;
            return [
                { index, start: slot.openingMinutes, end: endMinutes },
                { index, start: slot.openingMinutes + (24 * 60), end: endMinutes + (24 * 60) },
            ];
        })
        .sort((a, b) => a.start - b.start);
    for (let i = 1; i < expandedIntervals.length; i += 1) {
        const current = expandedIntervals[i];
        const previous = expandedIntervals[i - 1];
        if (current.index !== previous.index && current.start < previous.end) {
            throw new ValidationError('Time slots cannot overlap');
        }
    }

    return [...normalized]
        .sort((a, b) => a.openingMinutes - b.openingMinutes)
        .map(({ openingTime, closingTime }) => ({ openingTime, closingTime }));
};

const defaultTimings = () =>
    DAY_NAMES.map((day) => ({
        day,
        isOpen: true,
        openingTime: '09:00',
        closingTime: '22:00',
        slots: [{ openingTime: '09:00', closingTime: '22:00' }]
    }));

const toClientShape = (doc) => {
    const timings = Array.isArray(doc?.timings) ? doc.timings : [];
    const map = {};
    for (const day of DAY_NAMES) {
        const found = timings.find((t) => normalizeDay(t?.day) === day);
        const isOpen = found ? found.isOpen !== false : true;
        let normalizedSlots = [];
        if (isOpen) {
            try {
                normalizedSlots = normalizeSlots(
                    found?.slots,
                    normalizeTime(found?.openingTime, '09:00'),
                    normalizeTime(found?.closingTime, '22:00')
                );
            } catch (_) {
                normalizedSlots = [{ openingTime: '09:00', closingTime: '22:00' }];
            }
        }

        map[day] = {
            isOpen,
            openingTime: isOpen ? (normalizedSlots[0]?.openingTime || '09:00') : '',
            closingTime: isOpen ? (normalizedSlots[0]?.closingTime || '22:00') : '',
            slots: normalizedSlots
        };
    }
    return map;
};

export async function getOutletTimingsForRestaurant(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const doc = await FoodRestaurantOutletTimings.findOne({ restaurantId }).select('timings updatedAt').lean();
    if (!doc) return { outletTimings: toClientShape({ timings: defaultTimings() }) };
    return { outletTimings: toClientShape(doc) };
}

export async function upsertOutletTimingsForRestaurant(restaurantId, outletTimings) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    if (!outletTimings || typeof outletTimings !== 'object' || Array.isArray(outletTimings)) {
        throw new ValidationError('outletTimings must be an object keyed by day name');
    }

    const timings = DAY_NAMES.map((day) => {
        const src = outletTimings[day] && typeof outletTimings[day] === 'object' ? outletTimings[day] : {};
        const isOpen = src.isOpen !== false;
        const legacyOpening = normalizeTime(src.openingTime, '09:00');
        const legacyClosing = normalizeTime(src.closingTime, '22:00');
        const slots = isOpen
            ? normalizeSlots(src.slots, legacyOpening, legacyClosing)
            : [];
        return {
            day,
            isOpen,
            openingTime: isOpen ? (slots[0]?.openingTime || '09:00') : '',
            closingTime: isOpen ? (slots[0]?.closingTime || '22:00') : '',
            slots
        };
    });

    const doc = await FoodRestaurantOutletTimings.findOneAndUpdate(
        { restaurantId },
        { $set: { timings } },
        { upsert: true, new: true, setDefaultsOnInsert: true, projection: 'timings updatedAt' }
    ).lean();

    return { outletTimings: toClientShape(doc) };
}

