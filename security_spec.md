# Security Specification & Dirty Dozen Audit

## 1. Data Invariants
1. Any Google-authenticated, email-verified user (`email_verified == true`) can read shop records, create/progress active work orders, update customers/vehicles, write work-order audit entries, and mark notifications read.
2. Only `management` role (or bootstrapped owner `a.infj.13@gmail.com`) can create/update `/services` (price catalog), `/price_audit_log`, `/company` (tax rate & shop profile after initial creation), `/staff` (roles & active status), or modify work order `discount`, `taxRate`, `paymentMethod`, `amountPaid`, `paid` status, and `voided` status.
3. No deletions are permitted on `/customers`, `/vehicles`, `/work_orders`, `/work_orders/{id}/audit_log`, `/price_audit_log`, `/staff`, `/services`, `/company`, or `/staff_notifications`.
4. Non-management users cannot create a work order with `discount > 0`, cannot modify `discount` or `taxRate` on work order updates (enforced via `affectedKeys().hasAny(['discount', 'taxRate'])`), and cannot transition any work order to `paid` or `voided`.
5. Paid work orders are locked against edits to status, line items, customer, vehicle, or totals. Only `management` can transition a `paid` work order to `voided`, and only with a non-empty `voidReason` (>= 3 chars). Voided work orders are permanently immutable.
6. Audit log entries (`/work_orders/{id}/audit_log/{logId}` and `/price_audit_log/{logId}`) are append-only (`allow update, delete: if false`).
7. Every create operation validates full entity schemas (`isValidCustomer`, `isValidVehicle`, `isValidWorkOrder`), valid IDs, `createdByUid == request.auth.uid`, and server timestamps (`request.time`); updates validate modified fields via `isValid*Update` helpers and strict `affectedKeys().hasOnly(...)` allowlists.
8. All timestamps (`createdAt`, `updatedAt`) are strictly validated against `request.time`. All document IDs match `^[a-zA-Z0-9_\-]+$` with length <= 128.

## 2. The Dirty Dozen Adversarial Payloads
1. **Unauthenticated Read/Write**: Attempt to read `/customers` or create `/work_orders` without `request.auth`. -> Expected: `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Auth token with `email == 'a.infj.13@gmail.com'` and `email_verified == false` attempting to update `/services`. -> Expected: `PERMISSION_DENIED`.
3. **Unauthorized Shop Access**: Unauthenticated or unverified account attempting to list `/work_orders` or read `/customers`. -> Expected: `PERMISSION_DENIED`.
4. **Mechanic Price Catalog Escalation**: Active mechanic attempting to update `unitPrice` on `/services/svc_1`. -> Expected: `PERMISSION_DENIED`.
5. **Mechanic Role Self-Promotion**: Active mechanic attempting to update their own `/staff/{id}` document to `role: 'management'`. -> Expected: `PERMISSION_DENIED`.
6. **Mechanic Discount / Tax Rate Injection**: Active mechanic attempting to update `/work_orders/wo_1` with `discount: 50` or `taxRate: 0`. -> Expected: `PERMISSION_DENIED`.
7. **Mechanic Mark Paid Bypass**: Active mechanic attempting to update `/work_orders/wo_1` status to `paid` with `paymentMethod: 'cash'`. -> Expected: `PERMISSION_DENIED`.
8. **Paid Order Tampering**: Management attempting to modify `total` or `lineItems` on a work order whose existing status is `paid`. -> Expected: `PERMISSION_DENIED`.
9. **Void Without Reason**: Management attempting to transition a `paid` work order to `voided` with `voidReason: ''`. -> Expected: `PERMISSION_DENIED`.
10. **Work Order Deletion**: Management attempting to `delete` `/work_orders/wo_1`. -> Expected: `PERMISSION_DENIED`.
11. **Shadow Field Injection**: Authenticated user attempting to create `/customers/cust_1` with extra field `isAdmin: true` or update `/work_orders/wo_1` with an unallowed key. -> Expected: `PERMISSION_DENIED`.
12. **Client Timestamp Forgery & ID Poisoning**: Attempting to create `/work_orders/wo_1` with backdated `createdAt` (`!= request.time`) or a 500-char invalid document ID. -> Expected: `PERMISSION_DENIED`.
