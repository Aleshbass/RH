"use client";
import React from "react";
import Image from "next/image";
import { Button } from "../ui/moving-border";

export function RehabifyLearnSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div
          className="flex flex-col md:flex-row items-center gap-12 rounded-2xl p-10 md:p-16"
          style={{ backgroundColor: "#002e2c" }}
        >
          <div className="md:w-1/2 text-white">
            <h2 className="text-4xl font-bold mb-4">Unlock Your Potential with Rehabify Learn</h2>
            <p className="text-lg mb-8">
              Elevate your expertise with Rehabify Learn, our premier online learning platform for physiotherapy professionals. Engage with cutting-edge courses, earn accredited CPD points, and validate your knowledge with comprehensive exams. Upon successful completion, you&apos;ll receive a certificate to showcase your advanced skills and dedication to continuous professional development.
            </p>
            <a href="https://www.rehabifylearn.com" target="_blank" rel="noopener noreferrer">
              <Button
                borderRadius="1.75rem"
                className="bg-white dark:bg-slate-900 text-black dark:text-white border-neutral-200 dark:border-slate-800"
                borderClassName="bg-[radial-gradient(white_40%,transparent_60%)]"
              >
                Explore Courses
              </Button>
            </a>
          </div>
          <div className="md:w-1/2 flex justify-center">
            <Image
              src="https://res.cloudinary.com/dubeogufg/image/upload/e_background_removal/v1749584280/587shots_so_zxv6pf.webp"
              alt="Rehabify Learn Platform Showcase"
              width={3200}
              height={2800}
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
