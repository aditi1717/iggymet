import mongoose from "mongoose";

const timeSlotSchema = new mongoose.Schema(
  {
    openingTime: { type: String, trim: true }, // "HH:mm"
    closingTime: { type: String, trim: true }, // "HH:mm"
  },
  { _id: false },
);

const dayTimingSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, trim: true },
    isOpen: { type: Boolean, default: true },
    openingTime: { type: String, trim: true }, // "HH:mm"
    closingTime: { type: String, trim: true }, // "HH:mm"
    // New: multiple open windows in a day (e.g. 09:00-13:00, 16:00-22:00)
    slots: {
      type: [timeSlotSchema],
      default: [],
    },
  },
  { _id: false },
);

const outletTimingsSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodRestaurant",
      required: true,
      unique: true,
      index: true,
    },
    timings: {
      type: [dayTimingSchema],
      default: [],
    },
  },
  {
    collection: "food_restaurant_outlet_timings",
    timestamps: true,
  },
);

export const FoodRestaurantOutletTimings = mongoose.model(
  "FoodRestaurantOutletTimings",
  outletTimingsSchema,
);
