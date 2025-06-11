"use client";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto ",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoCard = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { currentTarget: target } = e;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty("--mouse-x", `${x}px`);
    target.style.setProperty("--mouse-y", `${y}px`);
  };

  useGSAP(() => {
    if (!cardRef.current || !headerRef.current) return;

    const card = cardRef.current;
    const header = headerRef.current;

    const onMouseMoveGSAP = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { top, left, width, height } = card.getBoundingClientRect();
      const x = clientX - left - width / 2;
      const y = clientY - top - height / 2;

      gsap.to(header, {
        x: x * 0.08,
        y: y * 0.08,
        rotateX: -y * 0.05,
        rotateY: x * 0.05,
        duration: 0.8,
        ease: "power3.out",
      });
    };

    const onMouseLeaveGSAP = () => {
      gsap.to(header, {
        x: 0,
        y: 0,
        rotateX: 0,
        rotateY: 0,
        duration: 1.2,
        ease: "elastic.out(1, 0.5)",
      });
    };

    card.addEventListener("mousemove", onMouseMoveGSAP);
    card.addEventListener("mouseleave", onMouseLeaveGSAP);

    return () => {
      card.removeEventListener("mousemove", onMouseMoveGSAP);
      card.removeEventListener("mouseleave", onMouseLeaveGSAP);
    };
  }, { scope: cardRef });

  return (
    <div
      ref={cardRef}
      className={cn(
        "row-span-1 rounded-3xl group/bento hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-6 bg-white border border-black/[0.1] justify-between flex flex-col space-y-4 relative overflow-hidden",
        className
      )}
      onMouseMove={handleMouseMove}
    >
      <div ref={headerRef} className="transition duration-200 h-full min-h-[15rem]">
        {header}
      </div>
      <div className="group-hover/bento:translate-x-1 transition duration-200 z-10 relative">
        {icon}
        <div className="font-pally font-bold text-neutral-800 text-xl mt-2 mb-1">
          {title}
        </div>
        <div className="font-pally font-normal text-neutral-600 text-sm">
          {description}
        </div>
      </div>
      {/* Glow effect */}
      <div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-300 group-hover/bento:opacity-100"
        style={{
          background:
            "radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), rgba(0, 91, 87, 0.1), transparent 80%)",
        }}
      />
    </div>
  );
};
