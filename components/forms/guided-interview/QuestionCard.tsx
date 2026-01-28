/**
 * Question Card Component
 * Renders individual interview questions with appropriate input controls
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { HelpCircle, Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Question } from '@/lib/interview'

interface QuestionCardProps {
  question: Question
  onAnswer: (answer: any) => Promise<void> | void
  isLoading?: boolean
  answeredQuestions?: number
  totalQuestions?: number
}

/**
 * Question Card Component
 */
export function QuestionCard({
  question,
  onAnswer,
  isLoading = false,
  answeredQuestions = 0,
  totalQuestions = 0,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  /**
   * Handle question answer
   */
  const handleSubmit = useCallback(async () => {
    if (answer === null || answer === undefined || answer === '') {
      return
    }

    try {
      setIsSubmitting(true)
      
      // Add a small delay for better UX (shows the button loading state)
      await new Promise(resolve => setTimeout(resolve, 300))
      
      await onAnswer(answer)
      
      // Reset for next question with a brief delay for smooth transition
      setTimeout(() => {
        setAnswer(null)
        setSelectedItems(new Set())
      }, 200)
    } catch (error) {
      console.error('Error submitting answer:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [answer, onAnswer])

  /**
   * Handle checkbox selection for multiselect
   */
  const handleCheckboxChange = useCallback(
    (value: string, checked: boolean) => {
      const newSelected = new Set(selectedItems)
      if (checked) {
        newSelected.add(value)
      } else {
        newSelected.delete(value)
      }
      setSelectedItems(newSelected)
      setAnswer(Array.from(newSelected))
    },
    [selectedItems]
  )

  /**
   * Render appropriate input based on question type
   */
  const renderInput = () => {
    switch (question.type) {
      case 'yes_no':
        return (
          <RadioGroup value={answer} onValueChange={setAnswer}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="yes" />
              <Label htmlFor="yes" className="cursor-pointer">
                Yes
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="no" />
              <Label htmlFor="no" className="cursor-pointer">
                No
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="unsure" id="unsure" />
              <Label htmlFor="unsure" className="cursor-pointer">
                Unsure
              </Label>
            </div>
          </RadioGroup>
        )

      case 'multiple_choice':
        return (
          <RadioGroup value={answer} onValueChange={setAnswer}>
            <div className="space-y-3">
              {question.options?.map((option) => (
                <div 
                  key={option.value} 
                  className={cn(
                    "group relative flex items-start space-x-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer",
                    "hover:border-primary/50 hover:shadow-md hover:bg-accent/30",
                    answer === option.value 
                      ? "border-primary bg-primary/5 shadow-sm dark:bg-primary/10" 
                      : "border-border bg-card/50 hover:bg-accent/20"
                  )}
                  onClick={() => setAnswer(option.value)}
                >
                  <RadioGroupItem 
                    value={option.value} 
                    id={option.value} 
                    className="mt-0.5" 
                  />
                  <div className="flex-1 min-w-0">
                    <Label 
                      htmlFor={option.value} 
                      className="cursor-pointer font-medium text-base text-foreground group-hover:text-primary transition-colors"
                    >
                      {option.label}
                    </Label>
                    {option.helperText && (
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                        {option.helperText}
                      </p>
                    )}
                  </div>
                  {answer === option.value && (
                    <div className="absolute top-3 right-3">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </RadioGroup>
        )

      case 'multiselect':
        return (
          <div className="space-y-3">
            {question.options?.map((option) => (
              <div key={option.value} className="flex items-start space-x-2">
                <Checkbox
                  id={option.value}
                  checked={selectedItems.has(option.value)}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange(option.value, checked as boolean)
                  }
                />
                <div className="flex-1">
                  <Label htmlFor={option.value} className="cursor-pointer font-normal">
                    {option.label}
                  </Label>
                  {option.helperText && (
                    <p className="text-xs text-muted-foreground mt-1">{option.helperText}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="checkbox-answer"
              checked={answer === true}
              onCheckedChange={(checked) => setAnswer(checked)}
            />
            <Label htmlFor="checkbox-answer" className="cursor-pointer">
              {question.helperText || 'Confirm'}
            </Label>
          </div>
        )

      case 'text':
        return (
          <Textarea
            placeholder={question.exampleAnswer || 'Enter your answer...'}
            value={answer || ''}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
          />
        )

      case 'numeric':
        return (
          <Input
            type="number"
            placeholder={question.exampleAnswer || 'Enter a number...'}
            value={answer || ''}
            onChange={(e) => setAnswer(e.target.value ? Number(e.target.value) : '')}
          />
        )

      case 'measurement':
        return (
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Value"
              value={answer?.value || ''}
              onChange={(e) =>
                setAnswer({
                  ...answer,
                  value: e.target.value,
                })
              }
              className="flex-1"
            />
            <Select
              value={answer?.unit || ''}
              onValueChange={(unit) =>
                setAnswer({
                  ...answer,
                  unit,
                })
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="celsius">°C</SelectItem>
                <SelectItem value="fahrenheit">°F</SelectItem>
                <SelectItem value="percent">%</SelectItem>
                <SelectItem value="meters">m</SelectItem>
                <SelectItem value="feet">ft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )

      case 'location':
        return (
          <Input
            placeholder="Enter location (e.g., Living Room, Master Bedroom)"
            value={answer || ''}
            onChange={(e) => setAnswer(e.target.value)}
          />
        )

      default:
        return (
          <Input
            placeholder="Enter your answer..."
            value={answer || ''}
            onChange={(e) => setAnswer(e.target.value)}
          />
        )
    }
  }

  return (
    <Card className="border-2 border-border/70 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-card via-card to-card/95">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="text-sm font-bold text-primary">
                    {answeredQuestions + 1}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl sm:text-2xl font-bold leading-tight text-foreground mb-2">
                  {question.text}
                </CardTitle>
                {question.helperText && (
                  <div className="flex items-start gap-2 mt-2">
                    <HelpCircle className="h-4 w-4 text-muted-foreground/70 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {question.helperText}
                    </p>
                  </div>
                )}
                {question.standardsJustification && (
                  <CardDescription className="text-sm mt-2 text-muted-foreground/90 italic">
                    {question.standardsJustification}
                  </CardDescription>
                )}
              </div>
            </div>

            {/* Standards badges - Enhanced display */}
            {question.standardsReference && question.standardsReference.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {question.standardsReference.map((std) => (
                  <Badge 
                    key={std} 
                    variant="secondary" 
                    className="text-xs font-medium bg-blue-100/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 px-2.5 py-1 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                  >
                    {std}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* Input field */}
        <div className="space-y-4">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderInput()}
          </div>
        </div>

        {/* Field mappings info - Enhanced */}
        {question.fieldMappings && question.fieldMappings.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-2 border-emerald-200/80 dark:border-emerald-800/60 rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
                  Auto-population Preview
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                  Answering this question will automatically fill {question.fieldMappings.length} field{question.fieldMappings.length > 1 ? 's' : ''} in your report
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {question.fieldMappings.map((mapping, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                >
                  <span className="text-xs font-medium">{mapping.formFieldId}</span>
                  {mapping.confidence < 100 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      {mapping.confidence}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit button - Enhanced */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={answer === null || answer === undefined || answer === '' || isSubmitting}
            className={cn(
              "flex-1 h-12 text-base font-semibold shadow-lg transition-all duration-200",
              "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80",
              "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>

        {/* Progress indicator - Enhanced */}
        {answeredQuestions > 0 && totalQuestions > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Question {answeredQuestions + 1} of {totalQuestions}</span>
              <span className="font-medium">
                {Math.round(((answeredQuestions + 1) / totalQuestions) * 100)}% complete
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((answeredQuestions + 1) / totalQuestions) * 100}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
