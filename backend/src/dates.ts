// Year 0000 is a valid JS date but not a PostgreSQL one, so it is refused here as well.
export const isCalendarDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    value >= '0001-01-01' &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

// The API accepts dates up to here, and a later date would not fit YYYY-MM-DD.
const lastDate = '9999-12-31';

// `days` after a YYYY-MM-DD date, in UTC so no local time zone shifts a day; never past the last
// date the API accepts.
export function datePlusDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() > 9999 ? lastDate : date.toISOString().slice(0, 10);
}
