"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StepWelcome } from "./StepWelcome";
import { StepCategories } from "./StepCategories";
import { StepAuth } from "./StepAuth";

const STEPS = ["welcome", "categories", "auth"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const step: Step = STEPS[stepIndex];

  function goNext() {
    setDirection(1);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setDirection(-1);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Progress rail */}
      <div className="fixed top-0 left-0 right-0 z-20 flex gap-1 p-4">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-sharp transition-colors duration-300 ${
              i <= stepIndex ? "bg-ember" : "bg-line"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-screen"
        >
          {step === "welcome" && <StepWelcome onNext={goNext} />}
          {step === "categories" && <StepCategories onNext={goNext} onBack={goBack} />}
          {step === "auth" && <StepAuth onBack={goBack} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
