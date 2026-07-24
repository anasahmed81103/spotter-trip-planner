/**
 * Small inline spinner shown while a trip plan is being generated.
 */

import "./LoadingSpinner.css";

export function LoadingSpinner() {
  return <span className="loading-spinner" role="status" aria-label="Loading" />;
}
