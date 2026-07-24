/**
 * Displays a user-facing error message, e.g. when the plan-trip request fails.
 */

import "./ErrorBanner.css";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      {message}
    </div>
  );
}
