import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { X } from "@/components/icons";

interface TourTooltipProps {
    stepIndex: number;
    totalSteps: number;
    title: string;
    content: string;
    onNext: () => void;
    onPrev: () => void;
    onSkip: () => void;
    onComplete: () => void;
    position?: "top" | "bottom" | "left" | "right";
    className?: string;
    style?: React.CSSProperties;
    isMobile?: boolean;
}

export function TourTooltip({
    stepIndex,
    totalSteps,
    title,
    content,
    onNext,
    onPrev,
    onSkip,
    onComplete,
    position = "bottom",
    className,
    style,
    isMobile = false,
}: TourTooltipProps) {
    const isLastStep = stepIndex === totalSteps - 1;

    return (
        <Card
            className={cn(
                "shadow-xl border-primary/20 absolute z-50 bg-background",
                !isMobile && "w-[320px]",
                isMobile && "border-t-primary/20 border-x-0 border-b-0 rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.1)]",
                className
            )}
            style={style}
        >
            <CardHeader className={cn("relative", isMobile ? "pb-2 pt-6" : "pb-2")}>
                {isMobile && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted rounded-full" />
                )}
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg font-bold text-primary">
                        {title}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 absolute right-4 top-4 text-muted-foreground hover:text-foreground"
                        onClick={onSkip}
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {content}
                </p>
            </CardContent>
            <CardFooter className="flex justify-between items-center pt-2 border-t">
                <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground font-medium">
                        {stepIndex + 1} / {totalSteps}
                    </span>
                </div>
                <div className="flex gap-3">
                    {stepIndex > 0 && (
                        <Button
                            variant="outline"
                            size={isMobile ? "default" : "sm"}
                            onClick={onPrev}
                            className={isMobile ? "flex-1" : ""}
                        >
                            Back
                        </Button>
                    )}
                    {isLastStep ? (
                        <Button
                            size={isMobile ? "default" : "sm"}
                            onClick={onComplete}
                            className={isMobile ? "flex-1" : ""}
                        >
                            Finish
                        </Button>
                    ) : (
                        <Button
                            size={isMobile ? "default" : "sm"}
                            onClick={onNext}
                            className={isMobile ? "flex-1" : ""}
                        >
                            Next
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
}
