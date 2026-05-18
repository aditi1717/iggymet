import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const phoneSchema = z
    .string()
    .min(8, 'Phone must be at least 8 digits')
    .max(15, 'Phone must be at most 15 digits');

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const aadharRegex = /^[0-9]{12}$/;
const drivingLicenseRegex = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;

const deliveryRegisterSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: phoneSchema,
    email: z.string().email().optional().or(z.literal('')),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleName: z.string().optional(),
    vehicleNumber: z.string().optional(),
    drivingLicenseNumber: z
        .string()
        .regex(drivingLicenseRegex, 'Invalid driving license format')
        .optional()
        .or(z.literal('')),
    ref: z.string().trim().max(64).optional().or(z.literal('')),
    panNumber: z
        .string()
        .regex(panRegex, 'Invalid PAN format')
        .optional()
        .or(z.literal('')),
    aadharNumber: z
        .string()
        .regex(aadharRegex, 'Invalid Aadhar format')
        .optional()
        .or(z.literal('')),
    fcmToken: z.string().optional().nullable(),
    platform: z.enum(['web', 'mobile']).optional().default('web')
});

export const validateDeliveryRegisterDto = (body) => {
    const result = deliveryRegisterSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

const deliveryProfileUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleName: z.string().optional(),
    vehicleNumber: z.string().optional(),
    drivingLicenseNumber: z
        .string()
        .regex(drivingLicenseRegex, 'Invalid driving license format')
        .optional()
        .or(z.literal('')),
    fcmToken: z.string().optional().nullable(),
    platform: z.enum(['web', 'mobile']).optional().default('web')
});

export const validateDeliveryProfileUpdateDto = (body) => {
    const result = deliveryProfileUpdateSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

const bankDetailsSchema = z.object({
    accountHolderName: z.string().trim().min(1, 'Account holder name is required'),
    accountNumber: z.string().trim().min(1, 'Account number is required'),
    ifscCode: z.string().trim().min(1, 'IFSC code is required'),
    bankName: z.string().trim().min(1, 'Bank name is required'),
    upiId: z.string().trim().min(1, 'UPI ID is required'),
    upiQrCode: z.string().optional().or(z.literal(''))
});

const bankDetailsUpdateSchema = z.object({
    documents: z.object({
        bankDetails: bankDetailsSchema,
        pan: z.object({ number: z.string().optional() }).optional()
    })
});

export const validateDeliveryBankDetailsDto = (body) => {
    // If we have flat keys from FormData (multer), reconstruct the nested object for Zod
    const processed = { ...body };
    if (!processed.documents) processed.documents = {};
    const nestedBank = processed?.documents?.bankDetails || {};
    processed.documents.bankDetails = {
        accountHolderName:
            body['documents[bankDetails][accountHolderName]'] ?? nestedBank.accountHolderName,
        accountNumber:
            body['documents[bankDetails][accountNumber]'] ?? nestedBank.accountNumber,
        ifscCode:
            body['documents[bankDetails][ifscCode]'] ?? nestedBank.ifscCode,
        bankName:
            body['documents[bankDetails][bankName]'] ?? nestedBank.bankName,
        upiId:
            body['documents[bankDetails][upiId]'] ?? nestedBank.upiId
    };
    if (!processed.documents.pan && body['documents[pan][number]']) {
        processed.documents.pan = { number: body['documents[pan][number]'] };
    }

    const result = bankDetailsUpdateSchema.safeParse(processed);
    if (!result.success) {
        const first = result.error.errors?.[0];
        if (first?.path?.length) {
            const field = first.path[first.path.length - 1];
            const message = first.message || 'Invalid value';
            throw new ValidationError(`${field}: ${message}`);
        }
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

