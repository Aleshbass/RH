import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOnboarding, TourStep } from "@/hooks/useOnboarding";
import { TourTooltip } from "./TourTooltip";
import { useMediaQuery } from "@/hooks/use-media-query"; // Assuming this exists or I'll create a simple one

const STEPS: TourStep[] = [
    {
        target: "#tour-welcome-header",
        title: "Welcome to Your Dashboard",
        content: "This is your central hub for managing patients, appointments, and your practice.",
        position: "bottom",
    },
    {
        target: "#tour-add-patient-btn",
        title: "Add New Patients",
        content: "Quickly invite new patients to the platform. They'll receive an email to set up their profile.",
        position: "bottom",
    },
    {
        target: "#tour-metrics-grid",
        title: "Key Metrics at a Glance",
        content: "Track your total patients, today's appointments, and completed sessions for the week.",
        position: "top",
    },
    {
        target: "#tour-todays-schedule",
        title: "Today's Schedule",
        content: "View your upcoming appointments for the day. Click on an appointment to see details.",
        position: "right",
    },
    {
        target: "#tour-recent-patients",
        title: "Recent Patients",
        content: "Quick access to patients you've recently interacted with. Click 'View All' for the full list.",
        position: "left",
    },
];

export function OnboardingTour() {
    const { showTour, completeTour, skipTour } = useOnboarding();
    const [currentStep, setCurrentStep] = useState(0);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    // Simple media query check if hook doesn't exist
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const updatePosition = useCallback(() => {
        if (!showTour) return;

        const step = STEPS[currentStep];
        const element = document.querySelector(step.target);

        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            const rect = element.getBoundingClientRect();
            setTargetRect(rect);

            // Calculate position
            // This is a simplified positioning logic. For production, consider using @floating-ui/react
            const padding = 10;
            let top = 0;
            let left = 0;
            const tooltipWidth = 320; // Approx width
            const tooltipHeight = 200; // Approx height

            // Mobile: Always bottom sheet
            if (isMobile) {
                setTooltipStyle({
                    position: "fixed",
                    bottom: "0",
                    left: "0",
                    right: "0",
                    width: "100%",
                    maxWidth: "100%",
                    borderRadius: "16px 16px 0 0",
                    zIndex: 100,
                    animation: "slide-up 0.3s ease-out",
                });
                return;
            }

            // Desktop positioning
            switch (step.position) {
                case "top":
                    top = rect.top - tooltipHeight - padding;
                    left = rect.left + rect.width / 2 - tooltipWidth / 2;
                    break;
                case "bottom":
                    top = rect.bottom + padding;
                    left = rect.left + rect.width / 2 - tooltipWidth / 2;
                    break;
                case "left":
                    top = rect.top + rect.height / 2 - tooltipHeight / 2;
                    left = rect.left - tooltipWidth - padding;
                    break;
                case "right":
                    top = rect.top + rect.height / 2 - tooltipHeight / 2;
                    left = rect.right + padding;
                    break;
                default:
                    top = rect.bottom + padding;
                    left = rect.left;
            }

            // Boundary checks (very basic)
            if (left < 10) left = 10;
            if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
            if (top < 10) top = 10;

            setTooltipStyle({
                position: "fixed",
                top: `${top}px`,
                left: `${left}px`,
                zIndex: 100,
            });
        }
    }, [showTour, currentStep, isMobile]);

    useEffect(() => {
        if (showTour) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(updatePosition, 500);
            window.addEventListener("resize", updatePosition);
            window.addEventListener("scroll", updatePosition);

            // Lock body scroll
            document.body.style.overflow = "hidden";

            return () => {
                clearTimeout(timer);
                window.removeEventListener("resize", updatePosition);
                window.removeEventListener("scroll", updatePosition);
                document.body.style.overflow = "";
            };
        }
    }, [showTour, currentStep, updatePosition]);

    // Keyboard navigation
    useEffect(() => {
        if (!showTour) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowRight":
                case "Enter":
                    if (currentStep < STEPS.length - 1) {
                        setCurrentStep((prev) => prev + 1);
                    } else {
                        completeTour();
                    }
                    break;
                case "ArrowLeft":
                    if (currentStep > 0) {
                        setCurrentStep((prev) => prev - 1);
                    }
                    break;
                case "Escape":
                    skipTour();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showTour, currentStep, completeTour, skipTour]);

    if (!showTour) return null;

    const step = STEPS[currentStep];

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            completeTour();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return createPortal(
        <>
            {/* Backdrop with spotlight effect */}
            <div className="fixed inset-0 z-40 bg-black/50 transition-all duration-300">
                {targetRect && (
                    <div
                        style={{
                            position: "absolute",
                            top: targetRect.top - 5,
                            left: targetRect.left - 5,
                            width: targetRect.width + 10,
                            height: targetRect.height + 10,
                            borderRadius: "8px",
                            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
                            pointerEvents: "none", // Let clicks pass through to the highlight? No, usually we block interactions.
                            // Actually, standard spotlight implementation uses a massive box-shadow or a clipped path.
                            // The box-shadow method above works well for simple cases.
                        }}
                    />
                )}
            </div>

            <TourTooltip
                stepIndex={currentStep}
                totalSteps={STEPS.length}
                title={step.title}
                content={step.content}
                onNext={handleNext}
                onPrev={handlePrev}
                onSkip={skipTour}
                onComplete={completeTour}
                position={step.position}
                style={tooltipStyle}
                isMobile={isMobile}
            />
        </>,
        document.body
    );
}
