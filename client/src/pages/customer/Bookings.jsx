import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  Users,
  Scissors,
  Video,
  AlertTriangle,
} from "lucide-react";
import {
  useData,
  useAction,
  PageHeading,
  QueryState,
  Pagination,
  Status,
} from "../../components/MarketUI";
import { Button } from "../../components/UI";
import { useAuth } from "../../context/AuthContext";
import { useLanguage, T } from "../../i18n/LanguageContext";
import { dateTime } from "../../utils/format";

const polling = { refetchInterval: 5000 };
export function Classes() {
  const { t } = useLanguage();
  const [discipline, setDiscipline] = useState("");
  const [page, setPage] = useState(1);
  const query = useData(
    ["class-discovery", discipline, page],
    `/class-sessions?${new URLSearchParams({ page, ...(discipline ? { discipline } : {}) })}`,
    polling,
  );
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow={t("Learn, move and grow")}
        title={t("Online classes")}
      >
        <Link className="button secondary" to="/bookings">
          {t("My bookings")}
        </Link>
      </PageHeading>
      <p className="muted">
        {t(
          "Live online teaching, gym and yoga sessions. All timings are in India time. Reserve one seat per person; your meeting link appears after booking.",
        )}
      </p>
      <div className="service-filter" role="group" aria-label={t("Class type")}>
        {[
          ["", "All classes"],
          ["TEACHING", "Teaching"],
          ["GYM", "Gym"],
          ["YOGA", "Yoga"],
        ].map(([value, label]) => (
          <Button
            key={value}
            className={discipline === value ? "" : "secondary"}
            aria-pressed={discipline === value}
            onClick={() => {
              setDiscipline(value);
              setPage(1);
            }}
          >
            {t(label)}
          </Button>
        ))}
      </div>
      <QueryState query={query}>
        {!query.data?.items.length && (
          <div className="panel service-empty">
            <CalendarDays />
            <h2>{t("No upcoming classes yet")}</h2>
            <p>{t("Check back for new teaching, gym and yoga sessions.")}</p>
          </div>
        )}
        <div className="service-grid">
          {query.data?.items.map((item) => (
            <ClassCard key={item._id} item={item} />
          ))}
        </div>
        <Pagination data={query.data} page={page} setPage={setPage} />
      </QueryState>
    </section>
  );
}

export function ClassCard({ item }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const action = useAction();
  const left = Math.max(0, item.capacity - item.reservedSeats);
  return (
    <article className="panel class-card">
      <div className="service-card-top">
        <span className="service-pill">
          <Video size={14} />
          {t(item.discipline)}
        </span>
        <span className={`seat-count ${left <= 3 ? "seats-low" : ""}`}>
          {left === 1 ? t("1 seat left") : t("{count} seats left", { count: left })}
        </span>
      </div>
      <h2>{item.title}</h2>
      {item.shopId?.name && (
        <Link className="text-link" to={`/shop/${item.shopId.slug}`}>
          {item.shopId.name}
        </Link>
      )}
      <p className="muted">{item.description}</p>
      <p className="service-time">
        <CalendarDays size={17} />
        {dateTime(item.startsAt)}
      </p>
      <p className="service-time">
        <Clock3 size={17} />
        {t("Ends at")} {dateTime(item.endsAt)}
      </p>
      <small>{t("India time · Online session")}</small>
      {!user ? (
        <Link className="button" to="/login">
          {t("Sign in to book")}
        </Link>
      ) : user.role === "customer" ? (
        <Button
          disabled={!left}
          busy={action.isPending}
          onClick={() =>
            action.mutate(
              { url: `/class-sessions/${item._id}/book` },
              { onSuccess: () => navigate("/bookings") },
            )
          }
        >
          {t(left ? "Reserve my seat" : "Class full")}
        </Button>
      ) : (
        <p className="muted">{t("Use a customer account to book.")}</p>
      )}
    </article>
  );
}

export function ServiceStore({ shop }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const classes = shop.businessType === "CLASSES";
  const [page, setPage] = useState(1);
  const query = useData(
    ["service-store", shop._id, classes, page],
    classes
      ? `/shops/${shop._id}/class-sessions?page=${page}`
      : `/shops/${shop._id}/barber-queue`,
    polling,
  );
  const action = useAction();
  const { user } = useAuth();
  return (
    <>
      <div className="panel service-hero">
        <span className="eyebrow">
          {t(classes ? "Online classes" : "Barber appointments")}
        </span>
        <h1>{shop.name}</h1>
        <p>{shop.description}</p>
        <p>
          {shop.address}, {shop.city} ·{" "}
          <a href={`tel:${shop.phone}`}>{shop.phone}</a>
        </p>
        <Link className="text-link" to="/bookings">
          {t("My bookings")} →
        </Link>
      </div>
      <QueryState query={query}>
        {classes ? (
          <>
            <PageHeading
              title={t("Upcoming sessions")}
              eyebrow={t("India time · Online session")}
            />
            {!query.data?.items.length && (
              <p className="panel">{t("No upcoming classes yet")}</p>
            )}
            <div className="service-grid">
              {query.data?.items.map((item) => (
                <ClassCard key={item._id} item={item} />
              ))}
            </div>
            <Pagination data={query.data} page={page} setPage={setPage} />
          </>
        ) : (
          <div className="panel barber-book-panel">
            <Scissors size={30} />
            <h2>{t("Book from home. Arrive for your turn.")}</h2>
            <div className="queue-summary">
              <div>
                <strong>{query.data?.waiting || 0}</strong>
                <span>{t("Customers waiting")}</span>
              </div>
              <div>
                <strong>
                  {query.data?.serving ? `#${query.data.serving}` : "—"}
                </strong>
                <span>{t("Now serving")}</span>
              </div>
            </div>
            <p>
              {t(
                "Appointments follow queue order, not a fixed time. Keep My bookings open to track your place. Reach the store when your waiting position is 2 or less.",
              )}
            </p>
            <p className="muted">
              {t(
                "Waiting appointments expire at midnight in India. Join only if you can visit today.",
              )}
            </p>
            {!query.data?.accepting && (
              <p className="notice">
                {t("Bookings are paused or the store is closed.")}
              </p>
            )}
            {!user ? (
              <Link className="button" to="/login">
                {t("Sign in to book")}
              </Link>
            ) : user.role === "customer" ? (
              <Button
                busy={action.isPending}
                disabled={!query.data?.accepting}
                onClick={() =>
                  action.mutate(
                    { url: `/shops/${shop._id}/barber-queue/join` },
                    { onSuccess: () => navigate("/bookings") },
                  )
                }
              >
                {t("Join the queue")}
              </Button>
            ) : (
              <p>{t("Use a customer account to book.")}</p>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}

export function MyBookings() {
  const { t } = useLanguage();
  const [classPage, setClassPage] = useState(1);
  const [barberPage, setBarberPage] = useState(1);
  const classes = useData(
    ["my-class-bookings", classPage],
    `/class-bookings/my?page=${classPage}`,
    polling,
  );
  const barbers = useData(
    ["my-barber-bookings", barberPage],
    `/barber-bookings/my?page=${barberPage}`,
    polling,
  );
  const action = useAction();
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow={t("Your time, organised")}
        title={t("My bookings")}
      />
      <h2 className="booking-section-heading">
        <Scissors />
        {t("Barber appointments")}
      </h2>
      <QueryState query={barbers}>
        {!barbers.data?.items.length && (
          <p className="panel">
            {t("No barber appointments yet.")}{" "}
            <Link className="text-link" to="/barbers">
              {t("Find a barber")}
            </Link>
          </p>
        )}
        <div className="service-grid">
          {barbers.data?.items.map((ticket) => (
            <article
              className={`panel queue-ticket ${ticket.arriveNow ? "queue-urgent" : ""}`}
              key={ticket._id}
            >
              <div className="service-card-top">
                <h3>{ticket.shopId?.name}</h3>
                <Status value={ticket.status} />
              </div>
              <span>
                {t("Ticket")} #{ticket.number}
              </span>
              {ticket.status === "WAITING" && (
                <>
                  <div className="queue-position">
                    <span>{t("Your waiting position")}</span>
                    <strong>{ticket.position}</strong>
                  </div>
                  {ticket.arriveNow && (
                    <div className="arrival-alert" role="alert">
                      <AlertTriangle size={22} />
                      <div>
                        <strong>
                          {t("Reach the store to avoid missing your turn.")}
                        </strong>
                        <p>
                          {t(
                            "Your turn is close. Please be at the store and ready when called.",
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="muted">
                    {t(
                      "Queue positions update automatically. The barber may reject your appointment if you are absent when called.",
                    )}
                  </p>
                  <Button
                    className="secondary"
                    busy={action.isPending}
                    onClick={() =>
                      action.mutate({
                        method: "patch",
                        url: `/barber-bookings/${ticket._id}`,
                        data: { status: "CANCELLED" },
                      })
                    }
                  >
                    {t("Cancel appointment")}
                  </Button>
                </>
              )}
              {ticket.status === "ONGOING" && (
                <p className="notice">{t("Your service is in progress.")}</p>
              )}
              {ticket.reason && (
                <p>
                  {t("Reason")}: {ticket.reason}
                </p>
              )}
              <p className="muted">
                {ticket.shopId?.address}, {ticket.shopId?.city}
              </p>
              {ticket.shopId?.slug && (
                <Link className="text-link" to={`/shop/${ticket.shopId.slug}`}>
                  {t("View business")}
                </Link>
              )}
            </article>
          ))}
        </div>
        <Pagination
          data={barbers.data}
          page={barberPage}
          setPage={setBarberPage}
        />
      </QueryState>
      <h2 className="booking-section-heading">
        <CalendarDays />
        {t("Class bookings")}
      </h2>
      <QueryState query={classes}>
        {!classes.data?.items.length && (
          <p className="panel">
            {t("No class bookings yet.")}{" "}
            <Link className="text-link" to="/classes">
              {t("Explore classes")}
            </Link>
          </p>
        )}
        <div className="service-grid">
          {classes.data?.items.map((booking) => (
            <article className="panel class-card" key={booking._id}>
              <div className="service-card-top">
                <h3>{booking.sessionId?.title}</h3>
                <Status
                  value={
                    booking.status === "CONFIRMED" &&
                    new Date(booking.sessionId?.endsAt) <= new Date()
                      ? "COMPLETED"
                      : booking.status
                  }
                />
              </div>
              <p>{booking.shopId?.name}</p>
              <p className="service-time">
                <CalendarDays size={17} />
                {booking.sessionId && dateTime(booking.sessionId.startsAt)}
              </p>
              <small>{t("India time · Online session")}</small>
              {booking.status === "CONFIRMED" &&
                !booking.sessionId?.cancelled && (
                  <>
                    {booking.sessionId?.joinUrl && (
                      <a
                        className="button"
                        href={booking.sessionId.joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Video size={17} />
                        {t("Join online class")}
                      </a>
                    )}
                    {new Date(booking.sessionId?.startsAt) > new Date() && (
                      <Button
                        className="secondary"
                        busy={action.isPending}
                        onClick={() =>
                          action.mutate({
                            method: "patch",
                            url: `/class-bookings/${booking._id}/cancel`,
                          })
                        }
                      >
                        {t("Cancel booking")}
                      </Button>
                    )}
                  </>
                )}
            </article>
          ))}
        </div>
        <Pagination
          data={classes.data}
          page={classPage}
          setPage={setClassPage}
        />
      </QueryState>
    </section>
  );
}
