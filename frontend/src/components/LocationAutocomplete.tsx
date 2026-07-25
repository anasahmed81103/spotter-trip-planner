/**
 * Location autocomplete: alphabetical local city catalog with instant
 * filtering, plus Nominatim only for places missing from that catalog.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { LocationSuggestion } from "../types/location";
import {
  searchLocalLocations,
  searchRemoteLocations,
} from "../services/locationSearchService";
import { LoadingSpinner } from "./LoadingSpinner";
import "./LocationAutocomplete.css";

const REMOTE_DEBOUNCE_MS = 350;
const MIN_REMOTE_QUERY_LENGTH = 3;

export interface LocationAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (location: LocationSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export function LocationAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
  disabled = false,
  "aria-invalid": ariaInvalid,
}: LocationAutocompleteProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<LocationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasRemoteSearched, setHasRemoteSearched] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 0,
  });

  const trimmedValue = value.trim();
  const showDropdown = isOpen && !disabled;

  const localSuggestions = useMemo(
    () => (showDropdown ? searchLocalLocations(trimmedValue) : []),
    [showDropdown, trimmedValue],
  );

  const needsRemoteSearch =
    showDropdown &&
    localSuggestions.length === 0 &&
    trimmedValue.length >= MIN_REMOTE_QUERY_LENGTH;

  const suggestions = localSuggestions.length > 0 ? localSuggestions : remoteSuggestions;
  const showingRemote = localSuggestions.length === 0 && remoteSuggestions.length > 0;

  function closeDropdown() {
    setIsOpen(false);
    setActiveIndex(-1);
    setRemoteSuggestions([]);
    setIsSearching(false);
    setSearchError(null);
    setHasRemoteSearched(false);
  }

  useEffect(() => {
    if (!needsRemoteSearch) {
      return;
    }

    const abortController = new AbortController();
    const debounceTimer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchRemoteLocations(trimmedValue, abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        setRemoteSuggestions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
        setHasRemoteSearched(true);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRemoteSuggestions([]);
        setActiveIndex(-1);
        setHasRemoteSearched(true);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Unable to search locations. Check your connection and try again.",
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, REMOTE_DEBOUNCE_MS);

    return () => {
      abortController.abort();
      window.clearTimeout(debounceTimer);
    };
  }, [needsRemoteSearch, trimmedValue]);

  useLayoutEffect(() => {
    if (!showDropdown) {
      return;
    }

    function updatePosition() {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      const rect = input.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showDropdown, suggestions.length, isSearching, searchError]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideRoot = rootRef.current?.contains(target);
      const clickedInsideList = listRef.current?.contains(target);
      if (!clickedInsideRoot && !clickedInsideList) {
        setIsOpen(false);
        setActiveIndex(-1);
        setRemoteSuggestions([]);
        setIsSearching(false);
        setSearchError(null);
        setHasRemoteSearched(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function commitSelection(location: LocationSuggestion) {
    setSelectedLocation(location);
    onChange(location.displayName);
    onSelect?.(location);
    closeDropdown();
    inputRef.current?.focus();
  }

  function handleInputChange(nextValue: string) {
    if (selectedLocation && nextValue !== selectedLocation.displayName) {
      setSelectedLocation(null);
    }

    onChange(nextValue);
    setIsOpen(true);
    setActiveIndex(0);
    setRemoteSuggestions([]);
    setSearchError(null);
    setHasRemoteSearched(false);
    setIsSearching(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        if (suggestions.length === 0) {
          return;
        }
        setActiveIndex((previous) => (previous + 1) % suggestions.length);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!isOpen || suggestions.length === 0) {
          return;
        }
        setActiveIndex((previous) =>
          previous <= 0 ? suggestions.length - 1 : previous - 1,
        );
        break;
      }
      case "Enter": {
        if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
          event.preventDefault();
          commitSelection(suggestions[activeIndex]);
        }
        break;
      }
      case "Escape": {
        if (isOpen) {
          event.preventDefault();
          closeDropdown();
        }
        break;
      }
      default:
        break;
    }
  }

  const activeOptionId =
    showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  const listStyle: CSSProperties = {
    top: dropdownPosition.top,
    left: dropdownPosition.left,
    width: dropdownPosition.width,
  };

  const showEmptyRemote =
    needsRemoteSearch &&
    !isSearching &&
    !searchError &&
    hasRemoteSearched &&
    suggestions.length === 0;

  const showTypeHint =
    showDropdown &&
    localSuggestions.length === 0 &&
    trimmedValue.length > 0 &&
    trimmedValue.length < MIN_REMOTE_QUERY_LENGTH;

  return (
    <div className="location-autocomplete" ref={rootRef}>
      <div className="location-autocomplete__control">
        <input
          ref={inputRef}
          id={id}
          name={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-invalid={ariaInvalid}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {isSearching && (
          <span className="location-autocomplete__spinner" aria-hidden="true">
            <LoadingSpinner />
          </span>
        )}
      </div>

      {showDropdown &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            className="location-autocomplete__list location-autocomplete__list--portal"
            role="listbox"
            aria-label="Location suggestions"
            style={listStyle}
          >
            {localSuggestions.length > 0 && (
              <li className="location-autocomplete__group" role="presentation">
                US cities
              </li>
            )}

            {showingRemote && (
              <li className="location-autocomplete__group" role="presentation">
                Other places
              </li>
            )}

            {isSearching && suggestions.length === 0 && !searchError && (
              <li className="location-autocomplete__status" role="presentation">
                Searching smaller towns…
              </li>
            )}

            {showTypeHint && (
              <li className="location-autocomplete__status" role="presentation">
                Keep typing to search towns outside the city list
              </li>
            )}

            {!isSearching && searchError && (
              <li
                className="location-autocomplete__status location-autocomplete__status--error"
                role="alert"
              >
                {searchError}
              </li>
            )}

            {showEmptyRemote && (
              <li className="location-autocomplete__status" role="option" aria-disabled="true">
                No locations found
              </li>
            )}

            {suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={`${suggestion.displayName}-${suggestion.latitude}-${suggestion.longitude}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  className={`location-autocomplete__option${isActive ? " location-autocomplete__option--active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => commitSelection(suggestion)}
                >
                  {suggestion.displayName}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
