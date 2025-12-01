import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TourTooltip } from "@/components/onboarding/TourTooltip";

export type TourStep = {
    target: string; // CSS selector or ID
    title: string;
    content: string;
    position?: "top" | "bottom" | "left" | "right";
};

interface TourGuideProps {
    tourId: string;
    steps: TourStep[];
    onComplete?: () => void;
    onSkip?: () => void;
    startDelay?: number;
}

export function TourGuide({ tourId, steps, onComplete, onSkip, startDelay = 1000 }: TourGuideProps) {
    const [showTour, setShowTour] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const completeTourMutation = useMutation(api.users.completeTour);

    // Check if tour should be shown
    useEffect(() => {
        const isCompleted = localStorage.getItem(`tour_completed_${tourId}`);
        if (!isCompleted) {
            // Small delay to allow page to render
            const timer = setTimeout(() => {
                setShowTour(true);
            }, startDelay);
            return () => clearTimeout(timer);
        }
    }, [tourId, startDelay]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const updatePosition = useCallback(() => {
        if (!showTour) return;

        const step = steps[currentStep];
        if (!step) return;

        const element = document.querySelector(step.target);

        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            const rect = element.getBoundingClientRect();
            setTargetRect(rect);

            // Calculate position
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

            // Boundary checks
            if (left < 10) left = 10;
            if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
            if (top < 10) top = 10;
            // Ensure top is not off-screen
            if (top + tooltipHeight > window.innerHeight) top = window.innerHeight - tooltipHeight - 10;


            setTooltipStyle({
                position: "fixed",
                top: `${top}px`,
                left: `${left}px`,
                zIndex: 100,
            });
        } else {
            // Element not found, maybe skip step or wait?
            // For now, we just don't show the highlight but show tooltip in center?
            // Or better, just wait.
            console.warn(`Tour target ${step.target} not found`);
        }
    }, [showTour, currentStep, isMobile, steps]);

    useEffect(() => {
        if (showTour) {
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

    const handleComplete = () => {
        localStorage.setItem(`tour_completed_${tourId}`, "true");
        completeTourMutation({ tourId });
        setShowTour(false);
        if (onComplete) onComplete();
    };

    const handleSkip = () => {
        localStorage.setItem(`tour_completed_${tourId}`, "true");
        completeTourMutation({ tourId });
        setShowTour(false);
        if (onSkip) onSkip();
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    if (!showTour) return null;

    const step = steps[currentStep];
    if (!step) return null;

    // Ensure we are on client side for createPortal
    if (typeof document === "undefined") return null;

    return createPortal(
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[90] bg-black/50 transition-all duration-300">
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
                            pointerEvents: "none",
                        }}
                    />
                )}
            </div>

            <TourTooltip
                stepIndex={currentStep}
                totalSteps={steps.length}
                title={step.title}
                content={step.content}
                onNext={handleNext}
                onPrev={handlePrev}
                onSkip={handleSkip}
                onComplete={handleComplete}
                position={step.position}
                style={tooltipStyle}
                isMobile={isMobile}
            />
        </>,
        document.body
    );
}
