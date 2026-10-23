import * as React from "react"
import { DayPicker, DayPickerSingleProps, DayPickerMultipleProps, DayPickerRangeProps } from "react-day-picker"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import "react-day-picker/dist/style.css"
import { ChevronLeft, ChevronRight } from "@/components/icons"

export type CalendarProps = {
  className?: string;
  classNames?: Partial<{
    months: string;
    month: string;
    caption: string;
    caption_label: string;
    nav: string;
    nav_button: string;
    nav_button_previous: string;
    nav_button_next: string;
    table: string;
    head_row: string;
    head_cell: string;
    row: string;
    cell: string;
    day: string;
    day_range_end: string;
    day_selected: string;
    day_today: string;
    day_outside: string;
    day_disabled: string;
    day_range_middle: string;
    day_hidden: string;
  }>;
  showOutsideDays?: boolean;
} & (
    | DayPickerSingleProps
    | DayPickerMultipleProps
    | DayPickerRangeProps
  )

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={0}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4 w-full",
        caption: "flex justify-between pt-1 relative items-center px-2",
        caption_label: "text-lg font-semibold text-gray-900",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "static",
        nav_button_next: "static",
        table: "w-full border-collapse space-y-1",
        head_row: "grid grid-cols-7 mb-1",
        head_cell:
          "text-muted-foreground rounded-md w-10 font-normal text-[0.8rem] uppercase text-center flex items-center justify-center mx-auto",
        row: "grid grid-cols-7 mt-2",
        cell: "h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 mx-auto",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 font-normal aria-selected:opacity-100 rounded-full transition-all duration-200 hover:scale-110 hover:bg-gray-100 mx-auto"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-[#005b57] text-white hover:bg-[#00443e] hover:text-white focus:bg-[#005b57] focus:text-white shadow-md hover:scale-105",
        day_today: "bg-gray-100 text-gray-900 font-semibold",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }: React.ComponentProps<'svg'>) => <ChevronLeft className="h-4 w-4" {...props} />,
        IconRight: ({ ...props }: React.ComponentProps<'svg'>) => <ChevronRight className="h-4 w-4" {...props} />,
      } as React.ComponentProps<typeof DayPicker>['components']}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar } 