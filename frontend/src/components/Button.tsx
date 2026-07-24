/**
 * Generic button used throughout the app, styled to match the dispatch
 * software theme instead of the browser default.
 */

import "./Button.css";

interface ButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}

export function Button(_props: ButtonProps) {
  return null;
}
