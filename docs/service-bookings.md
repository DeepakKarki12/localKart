# Class and barber bookings

Select a business type when applying, or in **Store settings → Business type** for an approved business. Existing shops default to Retail. A business cannot change type while it has active orders, future uncancelled classes or active barber appointments.

## Online classes

- **Classes** lists upcoming teaching, gym and yoga sessions, with India timings and remaining seats.
- Providers use **Manage classes** to publish individual dated sessions with a capacity and an HTTPS meeting link, view participants or cancel a session.
- One confirmed seat per customer per session. Reservations and cancellations run in MongoDB transactions, preventing overselling and restoring seats on cancellation.
- Meeting links are hidden from public listings. Only the provider and confirmed participants can retrieve them. Cancelled bookings, cancelled/ended sessions and suspended businesses do not expose customer joining links.
- A session uses the provider's existing meeting service; video conferencing and payments are not embedded in LocalCart.

## Barber appointments

- Customers join an approved, open barber's queue from home and track their ticket in **My bookings**.
- The waiting position counts waiting customers only. Starting, cancelling or rejecting a ticket advances everyone behind it. Positions **2 and 1** show the red arrival warning.
- The shopkeeper sees customer names, ticket numbers, the waiting queue and one ongoing job. Swipe the first customer to start; complete that job before accepting another. Keyboard users can focus the slider and press End.
- Reject an absent waiting customer with a reason. Customers may cancel their own waiting ticket.
- Queue bookings are for today and expire at midnight in India. An ongoing job can be completed after midnight. Expired tickets are excluded from queue positions and shown in history.
- **Pause bookings** prevents new joins without discarding the existing queue. Opening hours and temporary closure also control joining.
- This is a single-station queue rather than a guaranteed appointment time or a multi-barber roster.

Booking changes are persisted with in-app notifications, authenticated socket updates and a five-second polling fallback. Public queue endpoints expose counts and the serving ticket number, not customer identities. Both flows support English and Hindi.

Validation: `npm test`; `npm run test:e2e -w client -- --project=bookings`; `npm run build`.
