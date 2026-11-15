export function Stepper({ steps, currentStep }) {
  return (
    <div className="stepper" role="navigation" aria-label="Progress steps">
      {steps.map((step, index) => (
        <div 
          key={step} 
          className={`stepper-step ${index <= currentStep ? 'active' : ''}`}
          aria-current={index === currentStep ? 'step' : undefined}
        >
          {step}
        </div>
      ))}
    </div>
  );
}
