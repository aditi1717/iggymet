import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const labelSchema = z.enum(['Home', 'Office', 'Other']).default('Home');

const coordSchema = z
    .number()
    .finite()
    .refine((n) => Math.abs(n) <= 180, 'Invalid coordinate');

const createAddressSchema = z.object({
    label: labelSchema.optional(),
    street: z.string().min(1, 'Address is required').max(300).transform((s) => s.trim()),
    additionalDetails: z.string().max(500).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    buildingName: z.string().min(1, 'Building / apartment is required').max(150).transform((s) => s.trim()),
    floor: z.string().min(1, 'Floor / flat / unit is required').max(80).transform((s) => s.trim()),
    landmark: z.string().min(1, 'Landmark / area details are required').max(150).transform((s) => s.trim()),
    city: z.string().min(1, 'City is required').max(100).transform((s) => s.trim()),
    state: z.string().min(1, 'State is required').max(100).transform((s) => s.trim()),
    zipCode: z.string().max(20).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    phone: z.string().max(20).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    latitude: z.number().finite().min(-90).max(90),
    longitude: coordSchema
});

const updateAddressSchema = z.object({
    label: labelSchema.optional(),
    street: z.string().min(1, 'Address is required').max(300).optional().transform((s) => (s == null ? s : s.trim())),
    additionalDetails: z.string().max(500).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    buildingName: z.string().max(150).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    floor: z.string().max(80).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    landmark: z.string().max(150).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    city: z.string().min(1, 'City is required').max(100).optional().transform((s) => (s == null ? s : s.trim())),
    state: z.string().min(1, 'State is required').max(100).optional().transform((s) => (s == null ? s : s.trim())),
    zipCode: z.string().max(20).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    phone: z.string().max(20).optional().or(z.literal('')).transform((s) => String(s || '').trim()),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: coordSchema.optional()
});

export const validateCreateAddressDto = (body) => {
    const result = createAddressSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

export const validateUpdateAddressDto = (body) => {
    const result = updateAddressSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    if (!Object.keys(result.data || {}).length) {
        throw new ValidationError('No fields to update');
    }
    return result.data;
};

