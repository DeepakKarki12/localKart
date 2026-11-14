import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  CalendarDays,
  Scissors,
  Users,
  Check,
  ChevronRight,
  Clock3,
} from "lucide-react";
import {
  useData,
  useAction,
  QueryState,
  PageHeading,
  Form,
  Pagination,
  Status,
} from "../../components/MarketUI";
import { Button } from "../../components/UI";
import { useLanguage } from "../../i18n/LanguageContext";
import { useShop } from "./ShopPages";
import { dateTime } from "../../utils/format";
import { classSessionSchema, indiaTimeToIso } from "../../utils/classSession";

const poll = { refetchInterval: 5000 };
export function ServiceBookings({ shop: suppliedShop }) {
  const { t } = useLanguage();
  const currentShop = useShop();
  const shop = suppliedShop || currentShop;
  if (shop.businessType === "CLASSES") return <ClassManager shop={shop} />;
  if (shop.businessType === "BARBER") return <BarberManager shop={shop} />;
  return (
    <div className="panel">
      <p>
        {t("Choose Classes or Barber in Store settings to enable bookings.")}
      </p>
      <Link to="/shopkeeper/settings">{t("Store settings")}</Link>
    </div>
  );
}

function ClassManager({ shop }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [show, setShow] = useState(false);
  const action = useAction();
  const query = useData(
    ["manage-class-sessions", shop._id, page],
    `/manage/shops/${shop._id}/class-sessions?page=${page}`,
    poll,
  );
  return (
    <>
      <PageHeading
        eyebrow={t("Your online studio")}
        title={t("Manage classes")}
      >
        <Button onClick={() => setShow(!show)}>
          {t(show ? "Close form" : "Schedule a class")}
        </Button>
      </PageHeading>
      <p className="muted">
        {t(
          "Create individual dated sessions for teaching, gym or yoga. Each booking reserves one seat. Meeting links are shared only with confirmed participants.",
        )}
      </p>
      {show && (
        <div className="panel">
          <h2>{t("New online session")}</h2>
          <p className="muted session-time-guidance">
            <Clock3 size={16} aria-hidden="true" />
            {t("Times use India Standard Time (IST, UTC+05:30).")}
          </p>
          <Form
            schema={classSessionSchema}
            defaults={{
              title: "",
              discipline: "TEACHING",
              description: "",
              startsAt: "",
              endsAt: "",
              capacity: 10,
              joinUrl: "",
            }}
            fields={[
              { name: "title", label: "Session title" },
              {
                name: "discipline",
                label: "Class type",
                type: "select",
                options: ["TEACHING", "GYM", "YOGA"].map((value) => ({
                  value,
                  label: value,
                })),
              },
              {
                name: "description",
                label: "Description",
                type: "textarea",
                wide: true,
              },
              {
                name: "startsAt",
                label: "Starts at (India time)",
                type: "datetime-local",
                help: "Choose a future date and time in IST.",
              },
              {
                name: "endsAt",
                label: "Ends at (India time)",
                type: "datetime-local",
                help: "Must be later than the start time.",
              },
              { name: "capacity", label: "Total seats", type: "number" },
              {
                name: "joinUrl",
                label: "Private meeting link",
                placeholder: "https://",
                type: "url",
                help: "Paste the full HTTPS link from your meeting provider.",
              },
            ]}
            submitLabel="Publish session"
            onSubmit={async (values, reset) => {
              await action.mutateAsync({
                url: `/shops/${shop._id}/class-sessions`,
                data: {
                  ...values,
                  startsAt: indiaTimeToIso(values.startsAt),
                  endsAt: indiaTimeToIso(values.endsAt),
                },
              });
              reset();
              setShow(false);
            }}
          />
        </div>
      )}
      <QueryState query={query}>
        {!query.data?.items.length && (
          <p className="panel">
            {t("No sessions yet. Schedule your first class.")}
          </p>
        )}
        <div className="service-grid">
          {query.data?.items.map((item) => (
            <ManagedClass key={item._id} item={item} />
          ))}
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </>
  );
}
function ManagedClass({ item }) {
  const { t } = useLanguage();
  const [roster, setRoster] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const action = useAction();
  const attendees = useData(
    ["class-attendees", item._id, page],
    `/class-sessions/${item._id}/attendees?page=${page}`,
    { ...poll, enabled: roster },
  );
  return (
    <article className="panel class-card">
      <div className="service-card-top">
        <span className="service-pill">{t(item.discipline)}</span>
        <Status
          value={
            item.cancelled
              ? "CANCELLED"
              : new Date(item.endsAt) < new Date()
                ? "COMPLETED"
                : "SCHEDULED"
          }
        />
      </div>
      <h2>{item.title}</h2>
      <p className="service-time">
        <CalendarDays size={17} />
        {dateTime(item.startsAt)}
      </p>
      <p>
        {t("Ends at")} {dateTime(item.endsAt)}
      </p>
      <strong>
        {t("{booked} of {capacity} seats booked", {
          booked: item.reservedSeats,
          capacity: item.capacity,
        })}
      </strong>
      {!item.cancelled && (
        <a
          className="text-link"
          href={item.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Open meeting link")}
        </a>
      )}
      <Button className="secondary" onClick={() => setRoster(!roster)}>
        {t(roster ? "Hide participants" : "View participants")}
      </Button>
      {roster && (
        <QueryState query={attendees}>
          <ul className="attendee-list">
            {attendees.data?.items.map((booking) => (
              <li key={booking._id}>{booking.customerName}</li>
            ))}
          </ul>
          {!attendees.data?.items.length && <p>{t("No participants yet.")}</p>}
          <Pagination data={attendees.data} page={page} setPage={setPage} />
        </QueryState>
      )}
      {!item.cancelled && new Date(item.endsAt) > new Date() && (
        <>
          <Button
            className="secondary danger-text"
            onClick={() => setConfirmCancel(!confirmCancel)}
          >
            {t("Cancel session")}
          </Button>
          {confirmCancel && (
            <div className="notice">
              <p>
                {t(
                  "Cancel this session? All participants will be notified and their bookings cancelled.",
                )}
              </p>
              <Button
                busy={action.isPending}
                onClick={() =>
                  action.mutate({
                    method: "patch",
                    url: `/class-sessions/${item._id}/cancel`,
                  })
                }
              >
                {t("Confirm cancellation")}
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function SwipeAccept({ onAccept, busy }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    if (!busy) {
      locked.current = false;
      setValue(0);
    }
  }, [busy]);
  async function finish() {
    if (value >= 90 && !busy && !locked.current) {
      locked.current = true;
      try {
        await onAccept();
      } catch {
        /* useAction displays the error. */
      } finally {
        locked.current = false;
        setValue(0);
      }
    } else setValue(0);
  }
  return (
    <div className={`swipe-accept ${busy ? "swipe-busy" : ""}`}>
      <span aria-hidden="true">
        <ChevronRight size={20} />
        {t(busy ? "Starting…" : "Swipe to accept")}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        disabled={busy}
        aria-label={t("Swipe to accept")}
        aria-valuetext={t("Slide right to start this customer’s job")}
        onChange={(event) => setValue(Number(event.target.value))}
        onPointerUp={finish}
        onPointerCancel={() => setValue(0)}
        onKeyUp={(event) => {
          if (["End", "ArrowRight", "Enter", " "].includes(event.key)) finish();
        }}
      />
      <small>{t("Slide right, or use End on your keyboard.")}</small>
    </div>
  );
}

function BarberManager({ shop }) {
  const { t } = useLanguage();
  const [historyPage, setHistoryPage] = useState(1);
  const action = useAction();
  const query = useData(
    ["manage-barber-queue", shop._id],
    `/manage/shops/${shop._id}/barber-queue`,
    poll,
  );
  const history = useData(
    ["barber-history", shop._id, historyPage],
    `/manage/shops/${shop._id}/barber-history?page=${historyPage}`,
    poll,
  );
  const ongoing = query.data?.items.find(
    (ticket) => ticket.status === "ONGOING",
  );
  const waiting =
    query.data?.items.filter((ticket) => ticket.status === "WAITING") || [];
  return (
    <>
      <PageHeading
        eyebrow={t("One customer at a time")}
        title={t("Live barber queue")}
      >
        <Button
          className="secondary"
          busy={action.isPending}
          onClick={() =>
            action.mutate({
              method: "patch",
              url: `/shops/${shop._id}`,
              data: { barberQueueOpen: !query.data?.accepting },
            })
          }
        >
          {t(query.data?.accepting ? "Pause bookings" : "Open bookings")}
        </Button>
      </PageHeading>
      <p className="muted">
        {t(
          "Start the first waiting customer when they arrive. Finish the ongoing job before accepting the next. Reject an absent customer with a reason.",
        )}
      </p>
      <QueryState query={query}>
        <div className="barber-workspace">
          <section className="panel ongoing-job">
            <span className="eyebrow">{t("Ongoing job")}</span>
            {ongoing ? (
              <>
                <div className="customer-avatar">
                  <Scissors size={30} />
                </div>
                <h2>{ongoing.customerName}</h2>
                <p>
                  {t("Ticket")} #{ongoing.number}
                </p>
                <Button
                  busy={action.isPending}
                  onClick={() =>
                    action.mutate({
                      method: "patch",
                      url: `/barber-bookings/${ongoing._id}`,
                      data: { status: "COMPLETED" },
                    })
                  }
                >
                  <Check size={18} />
                  {t("Complete job")}
                </Button>
              </>
            ) : (
              <>
                <h2>{t("Ready for the next customer")}</h2>
                <p>
                  {t("Swipe to accept the first person in your waiting queue.")}
                </p>
              </>
            )}
          </section>
          <section>
            <h2 className="booking-section-heading">
              <Users />
              {t("Waiting queue")}{" "}
              <span className="service-pill">{waiting.length}</span>
            </h2>
            {!waiting.length && (
              <p className="panel">{t("No customers waiting.")}</p>
            )}
            {waiting.map((ticket, index) => (
              <WaitingCustomer
                key={ticket._id}
                ticket={ticket}
                canStart={!ongoing && index === 0}
              />
            ))}
          </section>
        </div>
      </QueryState>
      <h2 className="booking-section-heading">{t("Past appointments")}</h2>
      <QueryState query={history}>
        {history.data?.items.map((ticket) => (
          <div className="panel list-row" key={ticket._id}>
            <div>
              <strong>{ticket.customerName}</strong>
              <p>
                #{ticket.number} · {dateTime(ticket.createdAt)}
              </p>
              {ticket.reason && <small>{ticket.reason}</small>}
            </div>
            <Status value={ticket.status} />
          </div>
        ))}
        {!history.data?.items.length && (
          <p className="muted">{t("No past appointments yet.")}</p>
        )}
        <Pagination
          data={history.data}
          page={historyPage}
          setPage={setHistoryPage}
        />
      </QueryState>
    </>
  );
}
function WaitingCustomer({ ticket, canStart }) {
  const { t } = useLanguage();
  const [reject, setReject] = useState(false);
  const action = useAction();
  return (
    <article className="panel waiting-customer">
      <div className="waiting-customer-name">
        <span className="queue-number">{ticket.position}</span>
        <div>
          <h3>{ticket.customerName}</h3>
          <small>
            {t("Ticket")} #{ticket.number}
          </small>
        </div>
      </div>
      {canStart && (
        <SwipeAccept
          busy={action.isPending}
          onAccept={() =>
            action.mutateAsync({
              method: "patch",
              url: `/barber-bookings/${ticket._id}`,
              data: { status: "ONGOING" },
            })
          }
        />
      )}
      <Button
        className="secondary danger-text"
        onClick={() => setReject(!reject)}
      >
        {t(reject ? "Cancel" : "Customer absent / reject")}
      </Button>
      {reject && (
        <Form
          schema={z.object({ reason: z.string().trim().min(3).max(300) })}
          defaults={{ reason: "" }}
          fields={[
            {
              name: "reason",
              label: "Reason",
              placeholder: "Customer not present when called",
            },
          ]}
          submitLabel="Reject appointment"
          onSubmit={(values) =>
            action.mutateAsync({
              method: "patch",
              url: `/barber-bookings/${ticket._id}`,
              data: { status: "REJECTED", ...values },
            })
          }
        />
      )}
    </article>
  );
}
