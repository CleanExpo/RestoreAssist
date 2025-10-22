import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Video, Play, Clock, BookOpen, Award, Users, TrendingUp } from 'lucide-react';
import { MainNavigation } from '../../components/navigation/MainNavigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export function TrainingPage() {
  const trainingCategories = [
    {
      title: 'Getting Started',
      videos: 8,
      duration: '45 min',
      level: 'Beginner',
      courses: [
        { name: 'Platform Overview', duration: '5 min', icon: '🎯' },
        { name: 'Your First Report', duration: '8 min', icon: '📝' },
        { name: 'Navigation & Interface', duration: '6 min', icon: '🧭' },
        { name: 'Account Settings', duration: '4 min', icon: '⚙️' }
      ]
    },
    {
      title: 'Core Features',
      videos: 12,
      duration: '90 min',
      level: 'Intermediate',
      courses: [
        { name: 'AI Report Generation', duration: '12 min', icon: '🤖' },
        { name: 'IICRC Compliance Checks', duration: '10 min', icon: '✅' },
        { name: 'Cost Estimation Tools', duration: '15 min', icon: '💰' },
        { name: 'Template Customization', duration: '8 min', icon: '📋' }
      ]
    },
    {
      title: 'Advanced Workflows',
      videos: 10,
      duration: '75 min',
      level: 'Advanced',
      courses: [
        { name: 'Batch Processing', duration: '12 min', icon: '⚡' },
        { name: 'API Integration', duration: '18 min', icon: '🔌' },
        { name: 'Analytics Deep Dive', duration: '15 min', icon: '📊' },
        { name: 'Team Management', duration: '10 min', icon: '👥' }
      ]
    }
  ];

  const featuredCourses = [
    {
      title: 'Complete RestoreAssist Mastery',
      description: 'Full comprehensive training from beginner to expert',
      duration: '4 hours',
      lessons: 25,
      badge: 'Most Popular',
      icon: <Award className="h-6 w-6" />
    },
    {
      title: 'IICRC Compliance Training',
      description: 'Master compliance standards and reporting',
      duration: '2 hours',
      lessons: 12,
      badge: 'Certification',
      icon: <BookOpen className="h-6 w-6" />
    },
    {
      title: 'Team Onboarding Series',
      description: 'Get your entire team up to speed quickly',
      duration: '90 min',
      lessons: 8,
      badge: 'Team Training',
      icon: <Users className="h-6 w-6" />
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-700 to-red-800 text-white">
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-red-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        <div className="relative container py-24">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 shadow-lg">
              <Video className="mr-2 h-4 w-4" />
              Video Training Library
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Learn at Your Own Pace
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-200 to-red-200">
                With Expert Training
              </span>
            </h1>
            <p className="text-xl text-pink-100 max-w-3xl mx-auto leading-relaxed">
              Step-by-step video tutorials designed for restoration professionals. From basic features to
              advanced workflows, master RestoreAssist with our comprehensive training library.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button asChild size="lg" className="text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg bg-white/10 border-white/30 hover:bg-white/20 text-white">
                <Link to="/resources/documentation">
                  View Documentation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Training Stats */}
      <section className="container py-12 -mt-8">
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { label: 'Training Videos', value: '30+', icon: <Video className="h-6 w-6" /> },
            { label: 'Total Duration', value: '5+ Hours', icon: <Clock className="h-6 w-6" /> },
            { label: 'Skill Levels', value: '3 Tiers', icon: <TrendingUp className="h-6 w-6" /> },
            { label: 'Completion Rate', value: '94%', icon: <Award className="h-6 w-6" /> }
          ].map((stat) => (
            <Card key={stat.label} className="text-center bg-white dark:bg-gray-900 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-3 text-primary">{stat.icon}</div>
                <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Training Categories */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Training by Category</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Structured learning paths from beginner to advanced
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {trainingCategories.map((category) => (
            <Card key={category.title} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <CardTitle className="text-xl mb-2">{category.title}</CardTitle>
                    <div className="flex gap-2 text-sm text-muted-foreground">
                      <span>{category.videos} videos</span>
                      <span>•</span>
                      <span>{category.duration}</span>
                    </div>
                  </div>
                  <Badge variant="secondary">{category.level}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {category.courses.map((course) => (
                    <div
                      key={course.name}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{course.icon}</span>
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">
                          {course.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="text-xs">{course.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured Courses */}
      <section className="container py-20 bg-secondary/20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Featured Training Courses</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Comprehensive courses designed for maximum learning efficiency
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {featuredCourses.map((course) => (
            <Card key={course.title} className="hover:shadow-lg transition-all hover:scale-105">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    {course.icon}
                  </div>
                  <Badge variant="secondary">{course.badge}</Badge>
                </div>
                <CardTitle>{course.title}</CardTitle>
                <CardDescription>{course.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {course.duration}
                  </div>
                  <div className="flex items-center gap-1">
                    <Play className="h-4 w-4" />
                    {course.lessons} lessons
                  </div>
                </div>
                <Button className="w-full" variant="outline">
                  <Play className="mr-2 h-4 w-4" />
                  Start Course
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Start your free trial today and get immediate access to our complete training library.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">
                  Talk to Sales
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
