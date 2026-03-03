"use client";

import * as React from "react";
import { format, isSameDay } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DateRange } from "react-day-picker";

interface DateRangeTimePickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  hasError?: boolean;
  id?: string;
  className?: string;
}

function get12HourTime(date: Date | undefined, defaultHour: number) {
  if (!date) {
    const period = defaultHour >= 12 ? "PM" : "AM";
    let h = defaultHour % 12;
    if (h === 0) h = 12;
    return { hours: String(h), minutes: "00", period };
  }
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return { hours: String(hours12), minutes, period };
}

function convertTo24Hour(hours12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hours12 === 12 ? 0 : hours12;
  return hours12 === 12 ? 12 : hours12 + 12;
}

function isAllDay(startDate: Date | undefined, endDate: Date | undefined): boolean {
  if (!startDate && !endDate) return true;
  const startIsAllDay = !startDate || (startDate.getHours() === 0 && startDate.getMinutes() === 0);
  const endIsAllDay = !endDate || (endDate.getHours() === 23 && endDate.getMinutes() === 59);
  return startIsAllDay && endIsAllDay;
}

export function DateRangeTimePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  placeholder = "Select event dates",
  disabled = false,
  minDate,
  hasError = false,
  id,
  className,
}: DateRangeTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [allDay, setAllDay] = React.useState(() => isAllDay(startDate, endDate));

  // Sync allDay state when dates are set externally (e.g. prefill from extraction)
  React.useEffect(() => {
    if (startDate || endDate) {
      setAllDay(isAllDay(startDate, endDate));
    }
  }, [startDate, endDate]);

  const startTime = get12HourTime(startDate, 9);
  const endTime = get12HourTime(endDate, 17);

  const handleAllDayToggle = (checked: boolean) => {
    setAllDay(checked);
    if (checked) {
      // Set to all-day: start 12:00 AM, end 11:59 PM
      if (startDate) {
        const newStart = new Date(startDate);
        newStart.setHours(0, 0, 0, 0);
        onStartDateChange(newStart);
      }
      if (endDate) {
        const newEnd = new Date(endDate);
        newEnd.setHours(23, 59, 0, 0);
        onEndDateChange(newEnd);
      }
    } else {
      // Set to specific times: default 9 AM - 5 PM
      if (startDate) {
        const newStart = new Date(startDate);
        newStart.setHours(9, 0, 0, 0);
        onStartDateChange(newStart);
      }
      if (endDate) {
        const newEnd = new Date(endDate);
        newEnd.setHours(17, 0, 0, 0);
        onEndDateChange(newEnd);
      }
    }
  };

  // Handle calendar range selection
  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) {
      onStartDateChange(undefined);
      onEndDateChange(undefined);
      return;
    }

    if (range.from) {
      const newStart = new Date(range.from);
      if (allDay) {
        newStart.setHours(0, 0, 0, 0);
      } else if (startDate) {
        newStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      } else {
        newStart.setHours(9, 0, 0, 0);
      }
      onStartDateChange(newStart);
    } else {
      onStartDateChange(undefined);
    }

    if (range.to) {
      const newEnd = new Date(range.to);
      if (allDay) {
        newEnd.setHours(23, 59, 0, 0);
      } else if (endDate) {
        newEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);
      } else {
        newEnd.setHours(17, 0, 0, 0);
      }
      onEndDateChange(newEnd);
    } else {
      onEndDateChange(undefined);
    }
  };

  // Handle time changes for start
  const handleStartTimeChange = (type: "hours" | "minutes", value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;
    if (type === "hours" && (numValue < 1 || numValue > 12)) return;
    if (type === "minutes" && (numValue < 0 || numValue > 59)) return;

    const newDate = startDate ? new Date(startDate) : new Date();
    if (!startDate) newDate.setHours(0, 0, 0, 0);

    if (type === "hours") {
      const hours24 = convertTo24Hour(numValue, startTime.period as "AM" | "PM");
      newDate.setHours(hours24, newDate.getMinutes(), 0, 0);
    } else {
      const currentHours12 = parseInt(startTime.hours, 10);
      const hours24 = convertTo24Hour(currentHours12, startTime.period as "AM" | "PM");
      newDate.setHours(hours24, numValue, 0, 0);
    }
    onStartDateChange(newDate);
  };

  const handleStartPeriodChange = (newPeriod: "AM" | "PM") => {
    if (newPeriod === startTime.period) return;
    const newDate = startDate ? new Date(startDate) : new Date();
    if (!startDate) newDate.setHours(0, 0, 0, 0);
    const currentHours12 = parseInt(startTime.hours, 10);
    const hours24 = convertTo24Hour(currentHours12, newPeriod);
    newDate.setHours(hours24, parseInt(startTime.minutes, 10), 0, 0);
    onStartDateChange(newDate);
  };

  // Handle time changes for end
  const handleEndTimeChange = (type: "hours" | "minutes", value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;
    if (type === "hours" && (numValue < 1 || numValue > 12)) return;
    if (type === "minutes" && (numValue < 0 || numValue > 59)) return;

    const newDate = endDate ? new Date(endDate) : new Date();
    if (!endDate) newDate.setHours(0, 0, 0, 0);

    if (type === "hours") {
      const hours24 = convertTo24Hour(numValue, endTime.period as "AM" | "PM");
      newDate.setHours(hours24, newDate.getMinutes(), 0, 0);
    } else {
      const currentHours12 = parseInt(endTime.hours, 10);
      const hours24 = convertTo24Hour(currentHours12, endTime.period as "AM" | "PM");
      newDate.setHours(hours24, numValue, 0, 0);
    }
    onEndDateChange(newDate);
  };

  const handleEndPeriodChange = (newPeriod: "AM" | "PM") => {
    if (newPeriod === endTime.period) return;
    const newDate = endDate ? new Date(endDate) : new Date();
    if (!endDate) newDate.setHours(0, 0, 0, 0);
    const currentHours12 = parseInt(endTime.hours, 10);
    const hours24 = convertTo24Hour(currentHours12, newPeriod);
    newDate.setHours(hours24, parseInt(endTime.minutes, 10), 0, 0);
    onEndDateChange(newDate);
  };

  // Format the display text
  const displayText = React.useMemo(() => {
    if (!startDate && !endDate) return null;
    if (allDay) {
      const parts: string[] = [];
      if (startDate) parts.push(format(startDate, "MMM d, yyyy"));
      if (endDate && startDate && !isSameDay(startDate, endDate)) {
        parts.push(format(endDate, "MMM d, yyyy"));
      }
      return parts.join("  →  ");
    }
    const parts: string[] = [];
    if (startDate) parts.push(format(startDate, "MMM d 'at' h:mm a"));
    if (endDate) parts.push(format(endDate, "MMM d 'at' h:mm a"));
    return parts.join("  →  ");
  }, [startDate, endDate, allDay]);

  const calendarRange: DateRange | undefined =
    startDate || endDate ? { from: startDate, to: endDate } : undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayText && "text-muted-foreground",
            hasError && "border-destructive focus:ring-destructive",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayText ? (
            <span className="truncate">{displayText}</span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={4}>
        <div className="max-h-[min(420px,var(--radix-popover-content-available-height))] overflow-y-auto">
          <Calendar
            mode="range"
            selected={calendarRange}
            onSelect={handleRangeSelect}
            initialFocus
            disabled={(day) => {
              if (minDate) {
                const minDateOnly = new Date(minDate);
                minDateOnly.setHours(0, 0, 0, 0);
                const dayOnly = new Date(day);
                dayOnly.setHours(0, 0, 0, 0);
                if (dayOnly < minDateOnly) return true;
              }
              return false;
            }}
          />

          {/* All day toggle + time pickers */}
          <div className="border-t px-3 py-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="all-day"
                checked={allDay}
                onCheckedChange={(checked) => handleAllDayToggle(checked === true)}
              />
              <Label htmlFor="all-day" className="text-sm font-medium cursor-pointer">
                All day
              </Label>
            </div>
          </div>

          {!allDay && (
            <div className="border-t px-3 py-2 space-y-2">
              {/* Start Time */}
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Label className="text-xs text-muted-foreground w-8 shrink-0">Start</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={startTime.hours}
                  onChange={(e) => handleStartTimeChange("hours", e.target.value)}
                  className="w-12 text-center h-7 text-xs"
                />
                <span className="text-muted-foreground text-xs">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={startTime.minutes}
                  onChange={(e) => handleStartTimeChange("minutes", e.target.value)}
                  className="w-12 text-center h-7 text-xs"
                />
                <ToggleGroup
                  type="single"
                  value={startTime.period}
                  onValueChange={(value) => {
                    if (value === "AM" || value === "PM") handleStartPeriodChange(value);
                  }}
                  variant="outline"
                  className="ml-auto"
                >
                  <ToggleGroupItem value="AM" aria-label="AM" className="h-7 text-xs px-1.5">AM</ToggleGroupItem>
                  <ToggleGroupItem value="PM" aria-label="PM" className="h-7 text-xs px-1.5">PM</ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* End Time */}
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Label className="text-xs text-muted-foreground w-8 shrink-0">End</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={endTime.hours}
                  onChange={(e) => handleEndTimeChange("hours", e.target.value)}
                  className="w-12 text-center h-7 text-xs"
                />
                <span className="text-muted-foreground text-xs">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={endTime.minutes}
                  onChange={(e) => handleEndTimeChange("minutes", e.target.value)}
                  className="w-12 text-center h-7 text-xs"
                />
                <ToggleGroup
                  type="single"
                  value={endTime.period}
                  onValueChange={(value) => {
                    if (value === "AM" || value === "PM") handleEndPeriodChange(value);
                  }}
                  variant="outline"
                  className="ml-auto"
                >
                  <ToggleGroupItem value="AM" aria-label="AM" className="h-7 text-xs px-1.5">AM</ToggleGroupItem>
                  <ToggleGroupItem value="PM" aria-label="PM" className="h-7 text-xs px-1.5">PM</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setIsOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
