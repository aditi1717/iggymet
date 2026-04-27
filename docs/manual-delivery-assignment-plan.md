# Manual Delivery Assignment Flow Plan

## Goal

Current requirement:

1. User places order.
2. Order goes to restaurant.
3. Restaurant accepts order.
4. Restaurant prepares food.
5. Restaurant clicks `Mark as Ready`.
6. Only after `Ready` status, order should appear in admin `Assign Delivery Partner` table.
7. Delivery boy must **not** be auto-assigned.
8. Restaurant `Accept` step must **not** send any request to delivery boy.
9. Admin should manually choose which delivery boy gets the order from a modal list.
10. The selected delivery boy should receive the assignment request only after admin clicks assign.
11. Admin side should also have a `Resend` button similar to the restaurant resend action.
12. Assign modal should show only delivery boys from the same zone.

## Expected Final Flow

### Stage 1: Order Creation

- User places order.
- Backend creates order with:
  - `orderStatus = created`
  - `dispatch.status = unassigned`
  - `dispatch.modeAtCreation = manual`
- Order notification goes only to restaurant.

### Stage 2: Restaurant Accepts

- Restaurant clicks `Accept`.
- Order status changes to `confirmed` or `preparing`.
- At this stage:
  - no delivery partner broadcast
  - no auto-assign
  - no rider notification
  - no request should go to delivery boy
- Order remains only in restaurant processing flow.

### Stage 3: Restaurant Marks Ready

- Restaurant clicks `Mark as Ready`.
- Order status changes to `ready_for_pickup`.
- Backend should create/admin-trigger a manual dispatch request state.
- Admin should receive:
  - notification
  - order visible in admin `Assign Delivery Partner` table
- Still:
  - no rider auto assignment
  - no public rider broadcast

### Stage 4: Admin Assigns Delivery Boy

- Admin opens pending ready orders from `Assign Delivery Partner` table.
- Admin clicks assign action.
- A modal opens with delivery partner list.
- Modal should show only same-zone delivery boys.
- Admin selects one delivery boy manually from the modal.
- Backend updates:
  - `dispatch.status = assigned`
  - `dispatch.deliveryPartnerId = selected rider id`
  - `dispatch.assignedAt = now`
- Only that selected delivery boy receives:
  - socket event
  - push notification
  - assignment request/order card

### Stage 5: Admin Resend

- If assigned rider did not respond or missed the notification:
  - admin can click `Resend`
- Resend should:
  - send notification again only to currently assigned rider
  - not auto-pick another rider
  - not broadcast to all riders

## Required Behavior Change

### Remove / Stop

- Auto assignment when restaurant accepts order.
- Auto search for nearby riders on `confirmed` / `preparing`.
- Auto broadcast to delivery partners before admin action.
- Any forced global dispatch mode returning `auto`.
- Any rider request on restaurant `accept`.

### Keep

- Restaurant receives new order as before.
- Restaurant can accept and mark ready as before.
- Existing delivery acceptance flow can continue after admin manually assigns rider.

## Suggested Backend Logic

### Order lifecycle rules

- `created` -> restaurant sees order
- `preparing` -> restaurant working, no delivery request yet
- `ready_for_pickup` -> admin assignment required
- `assigned` -> selected delivery boy notified
- `accepted` -> delivery boy accepted assignment

### New/clear dispatch intent

Recommended meaning:

- `dispatch.modeAtCreation = manual`
- `dispatch.status = unassigned` means rider not chosen yet
- admin queue filter should mainly show:
  - `orderStatus = ready_for_pickup`
  - `dispatch.status = unassigned`
- this queue should power the admin `Assign Delivery Partner` table
- delivery partner modal should be filtered by order `zoneId`

Optional extra field if needed for clarity:

- `dispatch.adminActionRequired = true/false`

This is optional because `ready_for_pickup + unassigned` may already be enough.

## Backend Files Likely Affected

### 1. `Backend/src/modules/food/orders/services/order.service.js`

Main change area.

- Stop rider notification/broadcast on restaurant accept.
- On `ready_for_pickup`, notify admin instead of riders.
- Manual assign function should notify selected delivery boy properly.
- Add resend function for admin-assigned rider.

### 2. `Backend/src/modules/food/orders/services/order-dispatch.service.js`

- Remove/disable forced auto mode behavior.
- Ensure settings do not override manual requirement.
- Prevent automatic retry/broadcast flow from running for this food order flow.

### 3. `Backend/src/modules/food/orders/controllers/order.controller.js`

- Add controller for admin resend if missing.
- Keep existing restaurant resend separate if still needed.

### 4. `Backend/src/modules/food/admin/routes/admin.routes.js`

Likely add routes like:

- `POST /food/admin/orders/:orderId/assign-delivery`
- `POST /food/admin/orders/:orderId/resend-delivery-notification`

If assign route already exists, it should be completed and exposed properly.

### 5. `Backend/src/modules/food/orders/models/order.model.js`

- Mostly already supports manual mode.
- May only need small cleanup if dispatch fields are enough already.

## Frontend Admin Plan

### Admin queue screen

Admin should have a page/table for:

- ready orders waiting for delivery assignment
- assigned orders
- resend action
- assign action that opens delivery partner modal

Recommended statuses for UI:

- `Ready for Assignment`
- `Assigned`
- `Accepted by Delivery Boy`

### Admin actions needed

- view order
- click `Assign Delivery Partner`
- open modal with delivery partner list
- modal should only show delivery boys from the same zone
- choose delivery boy
- confirm assign
- resend

## Frontend Files Likely Affected

### 1. `Frontend/src/services/api/index.js`

- Add missing admin APIs:
  - assign delivery partner
  - resend delivery notification from admin
- Keep restaurant resend API separate.

### 2. `Frontend/src/modules/Food/pages/admin/OrderDetectDelivery.jsx`

- Show orders that are `ready_for_pickup` and unassigned.
- Add clear status for pending admin action.
- This can become or feed the `Assign Delivery Partner` table.

### 3. `Frontend/src/modules/Food/components/admin/orders/OrderDetectDeliveryTable.jsx`

- Add action buttons:
  - `Assign`
  - `Resend`
  - `View`
- `Assign` should open modal, not assign directly.

### 4. `Frontend/src/modules/Food/components/admin/orders/ViewOrderDetectDeliveryDialog.jsx`

- Add rider assignment UI or connect to a separate assign modal.
- Show current dispatch info.

### 5. New admin assign modal

Recommended modal behavior:

- open on `Assign` click
- fetch/list available delivery partners
- pass order zone id while fetching
- show only delivery partners from the same zone
- show name, phone, status, maybe online/offline
- select one rider
- click confirm assign

### Zone Rule

- If order belongs to `zoneId = X`, modal should show only delivery boys of `zoneId = X`
- Delivery boys from other zones should not appear
- If no delivery boy exists in that zone, modal should show empty state
- Out-of-zone riders should not be shown as fallback

### 5. Delivery partner UI

- No major behavior change needed except:
  - rider should only receive order after admin assignment
  - no early broadcast before admin choice

## Notification Plan

### Restaurant

- New order notification only.

### Admin

- Notify when restaurant marks order ready.
- Message example:
  - `Order FOD-XXXXXX is ready. Please assign a delivery boy.`

### Delivery Boy

- Notify only after admin manually assigns.
- Resend should target only assigned rider.

## API / Action Summary

### Restaurant side

- `Accept order`
- `Mark as ready`

### Admin side

- `Get ready orders pending assignment`
- `Open assign-delivery-partner modal`
- `Fetch same-zone delivery partners`
- `Assign delivery boy`
- `Resend assignment notification`

### Delivery side

- `Accept assigned order`

## Edge Cases

### If restaurant marks ready but admin does not assign yet

- Order stays in admin pending queue.
- No rider sees it.
- It should remain visible in `Assign Delivery Partner` table until assigned.

### If admin assigns wrong rider

- Later enhancement can support:
  - reassign
  - cancel current assignment

### If assigned rider does not respond

- Admin uses resend.
- If needed later, admin can change rider manually.

## Implementation Order

1. Fix backend flow so no rider auto notification happens on restaurant accept.
2. Trigger admin notification when restaurant clicks ready.
3. Ensure ready orders enter admin `Assign Delivery Partner` table.
4. Complete admin manual assign API.
5. Add admin assign modal with same-zone delivery partner list.
6. Add admin resend API.
7. Verify selected rider alone receives assignment.

## Success Criteria

This feature is complete when:

1. Restaurant accept does not assign or notify riders automatically.
2. Restaurant `Mark as Ready` sends the order to admin `Assign Delivery Partner` table.
3. Admin can open modal and see only same-zone delivery boys.
4. Only selected delivery boy gets the order request.
5. Admin can resend the assignment request.
6. No auto assignment happens anywhere in the flow.
