import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FormNavigation } from "../../components/initial-data-entry/FormNavigation";

function RealFormBoundary() {
  const [step, setStep] = useState(0);
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      (window as any).__submitCount += 1;
    }}>
      <FormNavigation currentStep={step} totalSteps={2} isValid
        isLastStep={step === 1} loading={false}
        onPrevious={() => setStep(0)} onNext={() => setStep(1)} />
    </form>
  );
}

(window as any).__submitCount = 0;
createRoot(document.getElementById("root")!).render(<RealFormBoundary />);
