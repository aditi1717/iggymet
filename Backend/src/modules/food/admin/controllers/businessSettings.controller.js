import { FoodBusinessSettings } from '../models/businessSettings.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';

const DEFAULT_MAINTENANCE_CONTENT = {
    userApp: {
        heading: 'Store is Closed',
        paragraph: 'Currently undergoing maintenance.'
    },
    deliveryApp: {
        heading: 'Delivery is Temporarily Closed',
        paragraph: 'Please check again shortly.'
    },
    restaurantApp: {
        heading: 'Restaurant Panel is Temporarily Closed',
        paragraph: 'Maintenance is in progress. Please come back soon.'
    }
};

const sanitizeMaintenanceNode = (rawNode = {}, defaults = {}) => {
    const headingRaw = String(rawNode?.heading ?? defaults.heading ?? '').trim();
    const paragraphRaw = String(rawNode?.paragraph ?? defaults.paragraph ?? '').trim();
    return {
        enabled: Boolean(rawNode?.enabled),
        heading: (headingRaw || defaults.heading || '').slice(0, 120),
        paragraph: (paragraphRaw || defaults.paragraph || '').slice(0, 280)
    };
};

const normalizeMaintenanceModes = (raw = {}, previous = {}) => ({
    userApp: sanitizeMaintenanceNode(raw?.userApp ?? previous?.userApp, DEFAULT_MAINTENANCE_CONTENT.userApp),
    deliveryApp: sanitizeMaintenanceNode(raw?.deliveryApp ?? previous?.deliveryApp, DEFAULT_MAINTENANCE_CONTENT.deliveryApp),
    restaurantApp: sanitizeMaintenanceNode(raw?.restaurantApp ?? previous?.restaurantApp, DEFAULT_MAINTENANCE_CONTENT.restaurantApp)
});

export async function getBusinessSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne().lean();
        if (!settings) {
            // Create default settings if none exist
            settings = await FoodBusinessSettings.create({
                companyName: 'Appzeto',
                email: 'admin@appzeto.com'
            });
        }
        return sendResponse(res, 200, 'Business settings fetched successfully', settings);
    } catch (error) {
        next(error);
    }
}

export async function updateBusinessSettings(req, res, next) {
    try {
        const data = req.body.data ? JSON.parse(req.body.data) : {};
        const {
            companyName,
            email,
            phoneCountryCode,
            phoneNumber,
            address,
            state,
            pincode,
            region,
            logoUrl,
            faviconUrl,
            maintenanceModes
        } = data;

        // Validation
        if (!companyName || companyName.trim().length < 2 || companyName.trim().length > 50) {
            return res.status(400).json({ success: false, message: 'Company name must be between 2 and 50 characters' });
        }
        if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid email address (max 100 characters)' });
        }
        if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid phone number (7-15 digits required)' });
        }
        if (address && address.length > 250) {
            return res.status(400).json({ success: false, message: 'Address is too long (max 250 characters)' });
        }
        if (state && state.length > 50) {
            return res.status(400).json({ success: false, message: 'State name is too long (max 50 characters)' });
        }
        if (pincode && !/^\d{4,10}$/.test(pincode.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid pincode (4-10 digits required)' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings();
        }

        if (companyName) settings.companyName = companyName;
        if (email) settings.email = email;
        if (phoneCountryCode || phoneNumber) {
            settings.phone = {
                countryCode: phoneCountryCode || settings.phone?.countryCode || '+91',
                number: phoneNumber || settings.phone?.number || ''
            };
        }
        if (address !== undefined) settings.address = address;
        if (state !== undefined) settings.state = state;
        if (pincode !== undefined) settings.pincode = pincode;
        if (region) settings.region = region;
        if (logoUrl !== undefined) {
            settings.logo = {
                url: String(logoUrl || '').trim(),
                publicId: settings.logo?.publicId || ''
            };
        }
        if (faviconUrl !== undefined) {
            settings.favicon = {
                url: String(faviconUrl || '').trim(),
                publicId: settings.favicon?.publicId || ''
            };
        }
        if (maintenanceModes !== undefined) {
            settings.maintenanceModes = normalizeMaintenanceModes(
                maintenanceModes,
                settings.maintenanceModes || {}
            );
        }

        // Handle file uploads
        if (req.files) {
            if (req.files.logo) {
                const logoResult = await uploadImageBufferDetailed(req.files.logo[0].buffer, 'business/logos');
                settings.logo = {
                    url: logoResult.secure_url,
                    publicId: logoResult.public_id
                };
            }
            if (req.files.favicon) {
                const faviconResult = await uploadImageBufferDetailed(req.files.favicon[0].buffer, 'business/favicons');
                settings.favicon = {
                    url: faviconResult.secure_url,
                    publicId: faviconResult.public_id
                };
            }
        }

        await settings.save();
        return sendResponse(res, 200, 'Business settings updated successfully', settings);
    } catch (error) {
        next(error);
    }
}
