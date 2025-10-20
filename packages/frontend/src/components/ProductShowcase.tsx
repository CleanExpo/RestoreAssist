import React, { useState, useEffect } from 'react';

interface ShowcaseStep {
  title: string;
  description: string;
  image: string;
  highlight: string;
}

const showcaseSteps: ShowcaseStep[] = [
  {
    title: 'Step 1: Enter Damage Details',
    description: 'Simply fill out the form with property information, damage type, and description. Our intelligent form guides you through the process.',
    image: '/screenshots/06-dashboard-after-dev-login.png',
    highlight: 'Quick & Easy Form'
  },
  {
    title: 'Step 2: View Your Dashboard',
    description: 'Access all your generated reports in one place. Track costs, damage types, and report history at a glance.',
    image: '/screenshots/05-dashboard-with-generated-reports.png',
    highlight: 'Centralized Management'
  },
  {
    title: 'Step 3: Professional Water Damage Report',
    description: 'Comprehensive water damage reports with itemized estimates, GST calculations, payment schedules, and IICRC compliance notes.',
    image: '/screenshots/07-water-damage-report-expanded.png',
    highlight: '$5,236 Total Cost'
  },
  {
    title: 'Step 4: Fire Damage Documentation',
    description: 'Detailed fire damage assessments including smoke remediation, structural repairs, and professional authorization sections.',
    image: '/screenshots/08-fire-damage-report-expanded.png',
    highlight: '$6,853 Total Cost'
  },
  {
    title: 'Step 5: Flood Damage Analysis',
    description: 'Category 3 water damage reports with specialized protocols, comprehensive scope of work, and compliant documentation.',
    image: '/screenshots/09-flood-damage-report-expanded.png',
    highlight: '$9,064 Total Cost'
  },
  {
    title: 'Dark Mode Support',
    description: 'Professional appearance in any lighting condition. Fully responsive design that works on desktop, tablet, and mobile devices.',
    image: '/screenshots/10-dark-mode-dashboard-with-expanded-report.png',
    highlight: 'Professional & Accessible'
  }
];

export function ProductShowcase() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % showcaseSteps.length);
      setImageLoaded(false);
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handleStepClick = (index: number) => {
    setCurrentStep(index);
    setIsAutoPlaying(false);
    setImageLoaded(false);
  };

  const handleNext = () => {
    setCurrentStep((prev) => (prev + 1) % showcaseSteps.length);
    setIsAutoPlaying(false);
    setImageLoaded(false);
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => (prev - 1 + showcaseSteps.length) % showcaseSteps.length);
    setIsAutoPlaying(false);
    setImageLoaded(false);
  };

  const currentShowcase = showcaseSteps[currentStep];

  return (
    <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>See It In Action</span>
          </div>
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            From Input to
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Professional Report
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Watch how RestoreAssist transforms damage information into comprehensive, professional reports in minutes.
          </p>
        </div>

        {/* Main Showcase Area */}
        <div className="max-w-6xl mx-auto">
          {/* Progress Indicators */}
          <div className="flex justify-center space-x-2 mb-8">
            {showcaseSteps.map((step, index) => (
              <button
                key={index}
                onClick={() => handleStepClick(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? 'w-12 bg-gradient-to-r from-blue-600 to-purple-600'
                    : 'w-2 bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          {/* Content Card */}
          <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gray-100">
            {/* Info Section */}
            <div className="p-8 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full mb-3">
                    {currentShowcase.highlight}
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-2">
                    {currentShowcase.title}
                  </h3>
                  <p className="text-gray-700 text-lg">
                    {currentShowcase.description}
                  </p>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={handlePrevious}
                    className="p-2 rounded-full bg-white hover:bg-gray-100 shadow-md transition"
                    aria-label="Previous step"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="m15 18-6-6 6-6"></path>
                    </svg>
                  </button>
                  <button
                    onClick={handleNext}
                    className="p-2 rounded-full bg-white hover:bg-gray-100 shadow-md transition"
                    aria-label="Next step"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="m9 18 6-6-6-6"></path>
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className={`p-2 rounded-full shadow-md transition ${
                      isAutoPlaying ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                    aria-label={isAutoPlaying ? 'Pause autoplay' : 'Resume autoplay'}
                  >
                    {isAutoPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                        <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <polygon points="6 3 20 12 6 21 6 3"></polygon>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Screenshot Display */}
            <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden" style={{ minHeight: '600px' }}>
              <div className={`transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
                <img
                  src={currentShowcase.image}
                  alt={currentShowcase.title}
                  className="w-full h-auto"
                  onLoad={() => setImageLoaded(true)}
                  loading="eager"
                />
              </div>

              {/* Loading State */}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}

              {/* Step Counter */}
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                <span className="text-sm font-semibold text-gray-900">
                  {currentStep + 1} / {showcaseSteps.length}
                </span>
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="text-center p-6 bg-white rounded-xl shadow-md border border-gray-100">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M12 2v20M2 12h20"></path>
                </svg>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">GST Compliant</h4>
              <p className="text-sm text-gray-600">Automatic 10% GST calculation with clear breakdowns</p>
            </div>

            <div className="text-center p-6 bg-white rounded-xl shadow-md border border-gray-100">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                </svg>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">IICRC Standards</h4>
              <p className="text-sm text-gray-600">Industry-certified compliance documentation</p>
            </div>

            <div className="text-center p-6 bg-white rounded-xl shadow-md border border-gray-100">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Payment Terms</h4>
              <p className="text-sm text-gray-600">Professional 30/40/30 milestone structure</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
