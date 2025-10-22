"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
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

interface SmartDatetimeInputProps {
  value?: Date;
  onValueChange?: (date: Date) => void;
  placeholder?: string;
  className?: string;
  showCalendar?: boolean;
  showTimePicker?: boolean;
  disabled?: boolean;
}

export function SmartDatetimeInput({
  value,
  onValueChange,
  placeholder = "Select date and time",
  className,
  showCalendar = true,
  showTimePicker = true,
  disabled = false,
}: SmartDatetimeInputProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(value);
  const [timeValue, setTimeValue] = React.useState<string>(
    value ? format(value, "HH:mm") : "09:00"
  );
  const [isOpen, setIsOpen] = React.useState(false);

  const todayStart = React.useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  React.useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setTimeValue(format(value, "HH:mm"));
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    // Prevent selecting past dates
    const dayOnly = new Date(date);
    dayOnly.setHours(0, 0, 0, 0);
    if (dayOnly < todayStart) return;

    const [hours, minutes] = timeValue.split(":").map(Number);
    const newDate = new Date(date);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);
    
    setSelectedDate(newDate);
    
    // If no time picker, apply immediately
    if (!showTimePicker) {
      onValueChange?.(newDate);
      setIsOpen(false);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeValue(newTime);

    const [hours, minutes] = newTime.split(":").map(Number);

    // If there is already a selected date, update its time
    // If calendar is hidden (time-only mode), use today's date
    let baseDate = selectedDate ? new Date(selectedDate) : new Date();
    baseDate.setSeconds(0, 0);
    baseDate.setHours(hours);
    baseDate.setMinutes(minutes);

    setSelectedDate(baseDate);

    // In time-only mode, emit immediately so parent receives a valid Date
    if (!showCalendar) {
      onValueChange?.(baseDate);
    }
  };

  const handleApply = () => {
    if (selectedDate && onValueChange) {
      const [hours, minutes] = timeValue.split(":").map(Number);
      const finalDate = new Date(selectedDate);
      finalDate.setHours(hours);
      finalDate.setMinutes(minutes);
      
      onValueChange(finalDate);
      setIsOpen(false);
    }
  };

  const displayValue = () => {
    if (!selectedDate) {
      if (!showCalendar && showTimePicker) {
        // Show just the time if we're in time-only mode
        return timeValue || placeholder;
      }
      return placeholder;
    }
    
    if (showCalendar && showTimePicker) {
      return format(selectedDate, "PPP 'at' p");
    } else if (showCalendar) {
      return format(selectedDate, "PPP");
    } else if (showTimePicker) {
      return format(selectedDate, "p");
    }
    return placeholder;
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-11",
              !selectedDate && "text-muted-foreground"
            )}
          >
            {showCalendar && <CalendarIcon className="mr-2 h-4 w-4" />}
            {showTimePicker && !showCalendar && <Clock className="mr-2 h-4 w-4" />}
            {displayValue()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col">
            {showCalendar && (
              <div className="p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                />
              </div>
            )}
            
            {showTimePicker && (
              <div className="p-4 border-t bg-gray-50/50">
                <Label htmlFor="time" className="text-sm font-semibold mb-3 block text-gray-700">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Select Time
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={timeValue}
                  onChange={handleTimeChange}
                  className="w-full text-base h-11 font-medium"
                />
              </div>
            )}
            
            {showCalendar && showTimePicker && (
              <div className="flex justify-between items-center p-4 border-t bg-white">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-600"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  disabled={!selectedDate}
                  className="bg-[#005b57] hover:bg-[#00443e] text-white px-6"
                >
                  Confirm
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
