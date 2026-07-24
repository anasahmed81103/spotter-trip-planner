/**
 * Renders a single day's ELD log as the familiar 24-hour duty-status
 * grid, drawn with SVG.
 *
 * The visual grid isn't implemented yet - for now this renders the day's
 * data functionally (totals and a chronological event list) so the page
 * can be composed ahead of that work.
 */

import type { DailyLog } from "../types/trip";
import { formatDuration } from "../utils/formatDuration";
import { formatDateTime } from "../utils/formatDateTime";
import "./DailyLogSheet.css";

interface DailyLogSheetProps {
  dailyLog: DailyLog;
}

export function DailyLogSheet({ dailyLog }: DailyLogSheetProps) {
  return (
    <article className="daily-log-sheet" aria-label={`Daily log for ${dailyLog.logDate}`}>
      <h3 className="daily-log-sheet__date">{dailyLog.logDate}</h3>

      <dl className="daily-log-sheet__totals">
        <div>
          <dt>Driving</dt>
          <dd>{formatDuration(dailyLog.drivingHours)}</dd>
        </div>
        <div>
          <dt>On Duty</dt>
          <dd>{formatDuration(dailyLog.onDutyHours)}</dd>
        </div>
        <div>
          <dt>Off Duty</dt>
          <dd>{formatDuration(dailyLog.offDutyHours)}</dd>
        </div>
        <div>
          <dt>Sleeper Berth</dt>
          <dd>{formatDuration(dailyLog.sleeperBerthHours)}</dd>
        </div>
      </dl>

      <ol className="daily-log-sheet__events">
        {dailyLog.events.map((event, index) => (
          <li key={`${event.startTime}-${index}`} className="daily-log-sheet__event">
            <span className="daily-log-sheet__event-status">{event.status}</span>
            <span className="daily-log-sheet__event-time">
              {formatDateTime(event.startTime)} &ndash; {formatDateTime(event.endTime)}
            </span>
            <span className="daily-log-sheet__event-location">{event.location}</span>
            {event.remark && (
              <span className="daily-log-sheet__event-remark">{event.remark}</span>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
