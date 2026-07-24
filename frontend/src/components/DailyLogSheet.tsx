/**
 * Renders one DailyLog as an FMCSA-style 24-hour duty-status grid, drawn
 * with SVG: hour ticks across the top, one row per duty status, a colored
 * block per ScheduleEvent, and a step line connecting them (the familiar
 * look of a paper ELD log).
 *
 * Purely presentational - it only lays out the events it's given on a
 * fixed 24-hour scale; it doesn't compute durations, validate HOS rules,
 * or otherwise reason about the schedule.
 */

import type { DailyLog, DutyStatus, ScheduleEvent } from "../types/trip";
import { formatDuration } from "../utils/formatDuration";
import "./DailyLogSheet.css";

interface DailyLogSheetProps {
  dailyLog: DailyLog;
}

/** The four rows of an FMCSA paper log, top to bottom. */
type LogRow = "off_duty" | "sleeper_berth" | "driving" | "on_duty";

const ROW_ORDER: LogRow[] = ["off_duty", "sleeper_berth", "driving", "on_duty"];

const ROW_LABELS: Record<LogRow, string> = {
  off_duty: "Off Duty",
  sleeper_berth: "Sleeper Berth",
  driving: "Driving",
  on_duty: "On Duty",
};

const ROW_COLOR_VARS: Record<LogRow, string> = {
  off_duty: "var(--color-off-duty)",
  sleeper_berth: "var(--color-sleeper-berth)",
  driving: "var(--color-driving)",
  on_duty: "var(--color-on-duty)",
};

// Statuses finer-grained than the four paper-log rows (breaks, fuel stops,
// pickup/dropoff) are drawn on whichever row they visually belong to.
const STATUS_TO_ROW: Record<DutyStatus, LogRow> = {
  off_duty: "off_duty",
  break: "off_duty",
  sleeper_berth: "sleeper_berth",
  driving: "driving",
  on_duty: "on_duty",
  fuel: "on_duty",
  pickup: "on_duty",
  dropoff: "on_duty",
};

const LABEL_COLUMN_WIDTH = 120;
const GRID_WIDTH = 840;
const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 40;
const CHART_WIDTH = LABEL_COLUMN_WIDTH + GRID_WIDTH;
const CHART_HEIGHT = HEADER_HEIGHT + ROW_HEIGHT * ROW_ORDER.length;

/** Hours elapsed since local midnight of `logDate`, clamped to [0, 24]. */
function hoursSinceLogStart(isoString: string, logDate: string): number {
  const eventTime = new Date(isoString).getTime();
  const dayStart = new Date(`${logDate}T00:00:00`).getTime();
  const hours = (eventTime - dayStart) / (1000 * 60 * 60);
  return Math.min(Math.max(hours, 0), 24);
}

function xForHour(hour: number): number {
  return LABEL_COLUMN_WIDTH + (hour / 24) * GRID_WIDTH;
}

function yForRow(row: LogRow): number {
  return HEADER_HEIGHT + ROW_ORDER.indexOf(row) * ROW_HEIGHT;
}

/** "Mid.", "Noon", or the 12-hour-clock numeral for an hour 0-24. */
function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) {
    return "Mid.";
  }
  if (hour === 12) {
    return "Noon";
  }
  return String(hour % 12);
}

interface PositionedEvent {
  event: ScheduleEvent;
  row: LogRow;
  startHour: number;
  endHour: number;
}

export function DailyLogSheet({ dailyLog }: DailyLogSheetProps) {
  const positionedEvents: PositionedEvent[] = dailyLog.events.map((event) => ({
    event,
    row: STATUS_TO_ROW[event.status],
    startHour: hoursSinceLogStart(event.startTime, dailyLog.logDate),
    endHour: hoursSinceLogStart(event.endTime, dailyLog.logDate),
  }));

  const stepLinePoints = positionedEvents
    .flatMap(({ row, startHour, endHour }) => {
      const y = yForRow(row) + ROW_HEIGHT / 2;
      return [`${xForHour(startHour)},${y}`, `${xForHour(endHour)},${y}`];
    })
    .join(" ");

  return (
    <article className="daily-log-sheet" aria-label={`Daily log for ${dailyLog.logDate}`}>
      <h3 className="daily-log-sheet__date">{dailyLog.logDate}</h3>

      <svg
        className="daily-log-sheet__grid"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`24-hour duty status grid for ${dailyLog.logDate}`}
      >
        {Array.from({ length: 25 }, (_, hour) => {
          const x = xForHour(hour);
          const isMajor = hour % 6 === 0;
          return (
            <g key={hour}>
              <line
                x1={x}
                y1={HEADER_HEIGHT}
                x2={x}
                y2={CHART_HEIGHT}
                className={
                  isMajor ? "daily-log-sheet__gridline daily-log-sheet__gridline--major" : "daily-log-sheet__gridline"
                }
              />
              <text x={x} y={HEADER_HEIGHT - 8} className="daily-log-sheet__hour-label" textAnchor="middle">
                {hourLabel(hour)}
              </text>
            </g>
          );
        })}

        {ROW_ORDER.map((row, rowIndex) => {
          const y = yForRow(row);
          return (
            <g key={row}>
              <rect
                x={LABEL_COLUMN_WIDTH}
                y={y}
                width={GRID_WIDTH}
                height={ROW_HEIGHT}
                className={
                  rowIndex % 2 === 0
                    ? "daily-log-sheet__row-background"
                    : "daily-log-sheet__row-background daily-log-sheet__row-background--alt"
                }
              />
              <text
                x={LABEL_COLUMN_WIDTH - 8}
                y={y + ROW_HEIGHT / 2}
                className="daily-log-sheet__row-label"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {ROW_LABELS[row]}
              </text>
              <line
                x1={LABEL_COLUMN_WIDTH}
                y1={y + ROW_HEIGHT}
                x2={CHART_WIDTH}
                y2={y + ROW_HEIGHT}
                className="daily-log-sheet__gridline daily-log-sheet__gridline--major"
              />
            </g>
          );
        })}

        {positionedEvents.map(({ event, row, startHour, endHour }, index) => (
          <rect
            key={`${event.startTime}-${index}`}
            x={xForHour(startHour)}
            y={yForRow(row) + 6}
            width={Math.max(xForHour(endHour) - xForHour(startHour), 1)}
            height={ROW_HEIGHT - 12}
            fill={ROW_COLOR_VARS[row]}
          >
            <title>
              {event.status} @ {event.location}
              {event.remark ? ` (${event.remark})` : ""}
            </title>
          </rect>
        ))}

        {stepLinePoints && (
          <polyline points={stepLinePoints} className="daily-log-sheet__step-line" fill="none" />
        )}

        <rect
          x={LABEL_COLUMN_WIDTH}
          y={HEADER_HEIGHT}
          width={GRID_WIDTH}
          height={ROW_HEIGHT * ROW_ORDER.length}
          className="daily-log-sheet__grid-border"
          fill="none"
        />
      </svg>

      <dl className="daily-log-sheet__totals">
        <div>
          <dt>Off Duty</dt>
          <dd>{formatDuration(dailyLog.offDutyHours)}</dd>
        </div>
        <div>
          <dt>Sleeper Berth</dt>
          <dd>{formatDuration(dailyLog.sleeperBerthHours)}</dd>
        </div>
        <div>
          <dt>Driving</dt>
          <dd>{formatDuration(dailyLog.drivingHours)}</dd>
        </div>
        <div>
          <dt>On Duty</dt>
          <dd>{formatDuration(dailyLog.onDutyHours)}</dd>
        </div>
      </dl>
    </article>
  );
}
