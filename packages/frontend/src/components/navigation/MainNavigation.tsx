import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { LogoCompact } from '../ui/logo';
import { ThemeToggle } from '../ui/theme-toggle';
import { Button } from '../ui/button';

// SEO-Optimized Features Dropdown Structure
const featuresDropdown = {
  'Core Capabilities': [
    {
      title: 'AI-Powered Report Generation',
      description: 'Claude Opus 4 generates comprehensive reports in 10-15 seconds',
      href: '/features/ai-reports',
      icon: '🤖'
    },
    {
      title: 'IICRC Compliance Integration',
      description: 'Automatic compliance checking against IICRC S500, S520 standards',
      href: '/features/iicrc-compliance',
      icon: '✅'
    },
    {
      title: 'NCC 2022 Building Codes',
      description: 'State-specific building regulations and compliance notes',
      href: '/features/building-codes',
      icon: '🏗️'
    },
    {
      title: 'Accurate Cost Estimation',
      description: '2024 Australian market pricing with GST calculations',
      href: '/features/cost-estimation',
      icon: '💰'
    }
  ],
  'Damage Assessment Solutions': [
    {
      title: 'Water Damage Reports',
      description: 'Category 1-3 water damage with extraction and drying protocols',
      href: '/features/water-damage',
      icon: '💧'
    },
    {
      title: 'Fire & Smoke Damage',
      description: 'Structural fire damage, smoke remediation, and deodorisation',
      href: '/features/fire-damage',
      icon: '🔥'
    },
    {
      title: 'Storm Damage Assessment',
      description: 'Weather-related damage including wind, hail, and debris impact',
      href: '/features/storm-damage',
      icon: '⛈️'
    },
    {
      title: 'Flood & Mould Remediation',
      description: 'Category 3 flood damage and comprehensive mould protocols',
      href: '/features/flood-mould',
      icon: '🌊'
    }
  ],
  'Professional Tools': [
    {
      title: 'Multi-Format Export',
      description: 'PDF, Word, Excel formats for insurance claims and documentation',
      href: '/features/export-formats',
      icon: '📄'
    },
    {
      title: 'Report Template Library',
      description: 'Industry-standard templates customised for Australian market',
      href: '/features/templates',
      icon: '📋'
    },
    {
      title: 'Batch Report Processing',
      description: 'Process multiple claims simultaneously for scalability',
      href: '/features/batch-processing',
      icon: '⚡'
    },
    {
      title: 'Analytics Dashboard',
      description: 'Track costs, claim history, and business insights',
      href: '/features/analytics',
      icon: '📊'
    }
  ],
  'Support & Resources': [
    {
      title: 'Documentation & Guides',
      description: 'Comprehensive tutorials and best practices',
      href: '/resources/documentation',
      icon: '📚'
    },
    {
      title: 'Training Videos',
      description: 'Step-by-step training for technicians and admin staff',
      href: '/resources/training',
      icon: '🎓'
    },
    {
      title: 'API Integration',
      description: 'Connect RestoreAssist to your existing workflow systems',
      href: '/resources/api',
      icon: '🔌'
    },
    {
      title: 'Industry Compliance Updates',
      description: 'Stay current with IICRC, Australian Standards, and building codes',
      href: '/resources/compliance',
      icon: '📢'
    }
  ]
};

interface MainNavigationProps {
  onGetStarted?: () => void;
}

export function MainNavigation({ onGetStarted }: MainNavigationProps) {
  const navigate = useNavigate();
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleGetStarted = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      navigate('/');
    }
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shadow-sm">
      <div className="container">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <LogoCompact />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {/* Features Mega Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setIsFeaturesOpen(true)}
              onMouseLeave={() => setIsFeaturesOpen(false)}
            >
              <button
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                aria-expanded={isFeaturesOpen}
                aria-haspopup="true"
              >
                Features
                <ChevronDown className={`h-4 w-4 transition-transform ${isFeaturesOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Mega Dropdown Panel */}
              {isFeaturesOpen && (
                <div className="absolute left-0 top-full mt-2 w-screen max-w-4xl -translate-x-1/4 bg-background border rounded-lg shadow-2xl p-6 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                    {Object.entries(featuresDropdown).map(([category, items]) => (
                      <div key={category}>
                        <h3 className="text-sm font-semibold text-foreground mb-3 px-2">
                          {category}
                        </h3>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <Link
                              key={item.href}
                              to={item.href}
                              className="flex items-start gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors group"
                            >
                              <span className="text-xl mt-0.5 flex-shrink-0">{item.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                  {item.title}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {item.description}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dropdown Footer CTA */}
                  <div className="mt-6 pt-6 border-t">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Explore all features and capabilities
                      </div>
                      <Button onClick={handleGetStarted} size="sm">
                        Start Free Trial
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Other Navigation Links */}
            <Link
              to="/pricing"
              className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              About
            </Link>
            <Link
              to="/contact"
              className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              Contact
            </Link>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* CTA Button */}
            <Button onClick={handleGetStarted} className="shadow-md hover:shadow-lg transition-shadow">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t py-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-3">
              {/* Mobile Features Accordion */}
              <div>
                <button
                  onClick={() => setIsFeaturesOpen(!isFeaturesOpen)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                >
                  Features
                  <ChevronDown className={`h-4 w-4 transition-transform ${isFeaturesOpen ? 'rotate-180' : ''}`} />
                </button>

                {isFeaturesOpen && (
                  <div className="pl-6 pr-3 py-2 space-y-4 bg-secondary/20 rounded-lg mt-2">
                    {Object.entries(featuresDropdown).map(([category, items]) => (
                      <div key={category}>
                        <h4 className="text-xs font-semibold text-foreground/70 mb-2">{category}</h4>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <Link
                              key={item.href}
                              to={item.href}
                              className="block px-2 py-1.5 text-sm text-foreground/80 hover:text-foreground hover:bg-secondary/50 rounded transition-colors"
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              {item.icon} {item.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/pricing"
                className="block px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                to="/about"
                className="block px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link
                to="/contact"
                className="block px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Contact
              </Link>

              <div className="pt-3 border-t">
                <Button onClick={handleGetStarted} className="w-full">
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
