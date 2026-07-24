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

import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { createPortal } from "react-dom";
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

/**
 * Hours elapsed since midnight on the origin-location log sheet.
 *
 * Read the wall-clock fields directly instead of constructing a Date,
 * because Date would convert the API timestamp into the viewer's browser
 * timezone. The API offset belongs to the route origin, and the sheet must
 * retain that local clock even when viewed from another timezone.
 */
function hoursSinceLogStart(isoString: string, logDate: string): number {
  const eventParts = isoString.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/
  );
  const logDateParts = logDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!eventParts || !logDateParts) {
    return 0;
  }

  const eventWallClock = Date.UTC(
    Number(eventParts[1]),
    Number(eventParts[2]) - 1,
    Number(eventParts[3]),
    Number(eventParts[4]),
    Number(eventParts[5]),
    Number(eventParts[6]),
  );
  const logStart = Date.UTC(
    Number(logDateParts[1]),
    Number(logDateParts[2]) - 1,
    Number(logDateParts[3]),
  );
  const hours = (eventWallClock - logStart) / (1000 * 60 * 60);
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

interface LogGridProps {
  dailyLog: DailyLog;
  positionedEvents: PositionedEvent[];
  stepLinePoints: string;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
}

function LogGrid({
  dailyLog,
  positionedEvents,
  stepLinePoints,
  className = "",
  svgRef,
}: LogGridProps) {
  return (
    <svg
      ref={svgRef}
      className={`daily-log-sheet__grid ${className}`.trim()}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`24-hour duty status grid for ${dailyLog.logDate}`}
    >
      <title>{`Daily log for ${dailyLog.logDate}`}</title>
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
                isMajor
                  ? "daily-log-sheet__gridline daily-log-sheet__gridline--major"
                  : "daily-log-sheet__gridline"
              }
            />
            <text
              x={x}
              y={HEADER_HEIGHT - 8}
              className="daily-log-sheet__hour-label"
              textAnchor="middle"
            >
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
  );
}

function LogTotals({ dailyLog }: DailyLogSheetProps) {
  return (
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
  );
}

const EXPORTED_STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "stroke-width",
  "font-family",
  "font-size",
  "font-weight",
  "opacity",
] as const;

export function DailyLogSheet({ dailyLog }: DailyLogSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

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

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

  function downloadSvg() {
    const source = svgRef.current;
    if (!source) {
      return;
    }

    const clone = source.cloneNode(true) as SVGSVGElement;
    const sourceElements = Array.from(source.querySelectorAll<SVGElement>("*"));
    const cloneElements = Array.from(clone.querySelectorAll<SVGElement>("*"));

    sourceElements.forEach((element, index) => {
      const computed = window.getComputedStyle(element);
      const clonedElement = cloneElements[index];
      EXPORTED_STYLE_PROPERTIES.forEach((property) => {
        clonedElement.style.setProperty(property, computed.getPropertyValue(property));
      });
    });

    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(CHART_WIDTH));
    clone.setAttribute("height", String(CHART_HEIGHT));

    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(CHART_WIDTH));
    background.setAttribute("height", String(CHART_HEIGHT));
    background.setAttribute("fill", "#121820");
    clone.insertBefore(background, clone.firstChild);

    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hos-log-${dailyLog.logDate}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const modalTitleId = `daily-log-modal-${dailyLog.logDate}`;

  return (
    <>
      <article className="daily-log-sheet" aria-label={`Daily log for ${dailyLog.logDate}`}>
        <button
          className="daily-log-sheet__open-hit-area"
          type="button"
          aria-label={`Open full-size daily log for ${dailyLog.logDate}`}
          onClick={() => setIsExpanded(true)}
        />

        <div className="daily-log-sheet__header">
          <h3 className="daily-log-sheet__date">{dailyLog.logDate}</h3>
          <div className="daily-log-sheet__actions">
            <button type="button" onClick={() => setIsExpanded(true)}>
              View full size
            </button>
            <button type="button" onClick={downloadSvg}>
              Save SVG
            </button>
          </div>
        </div>

        <LogGrid
          dailyLog={dailyLog}
          positionedEvents={positionedEvents}
          stepLinePoints={stepLinePoints}
          svgRef={svgRef}
        />
        <LogTotals dailyLog={dailyLog} />
      </article>

      {isExpanded &&
        createPortal(
          <div
            className="daily-log-modal"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsExpanded(false);
              }
            }}
          >
            <section
              className="daily-log-modal__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={modalTitleId}
            >
              <header className="daily-log-modal__header">
                <div>
                  <p className="daily-log-modal__label">Daily HOS log</p>
                  <h2 id={modalTitleId}>{dailyLog.logDate}</h2>
                </div>
                <div className="daily-log-modal__actions">
                  <button type="button" onClick={downloadSvg}>
                    Save SVG
                  </button>
                  <button
                    className="daily-log-modal__close"
                    type="button"
                    aria-label="Close full-size log"
                    onClick={() => setIsExpanded(false)}
                    autoFocus
                  >
                    Close
                  </button>
                </div>
              </header>

              <div className="daily-log-modal__chart">
                <LogGrid
                  dailyLog={dailyLog}
                  positionedEvents={positionedEvents}
                  stepLinePoints={stepLinePoints}
                  className="daily-log-sheet__grid--expanded"
                />
              </div>
              <LogTotals dailyLog={dailyLog} />
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
