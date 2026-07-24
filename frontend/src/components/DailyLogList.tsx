/**
 * Stacks one DailyLogSheet per day of the trip.
 */

import type { DailyLog } from "../types/trip";
import { DailyLogSheet } from "./DailyLogSheet";
import "./DailyLogList.css";

interface DailyLogListProps {
  dailyLogs: DailyLog[];
}

export function DailyLogList({ dailyLogs }: DailyLogListProps) {
  if (dailyLogs.length === 0) {
    return null;
  }

  return (
    <div className="daily-log-list" aria-label="Daily log sheets">
      {dailyLogs.map((dailyLog) => (
        <DailyLogSheet key={dailyLog.logDate} dailyLog={dailyLog} />
      ))}
    </div>
  );
}
