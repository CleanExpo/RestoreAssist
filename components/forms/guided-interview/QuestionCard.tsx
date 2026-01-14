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
import { HelpCircle, Loader2 } from 'lucide-react'
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
      await onAnswer(answer)
      // Reset for next question
      setAnswer(null)
      setSelectedItems(new Set())
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
                <div key={option.value} className="flex items-start space-x-2">
                  <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{question.text}</CardTitle>
              {question.helperText && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      {question.helperText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {question.standardsJustification && (
              <CardDescription className="text-xs">{question.standardsJustification}</CardDescription>
            )}
          </div>

          {/* Standards badges */}
          <div className="flex flex-wrap gap-1 justify-end">
            {question.standardsReference?.slice(0, 2).map((std) => (
              <Badge key={std} variant="secondary" className="text-xs">
                {std.split(' ')[0]}
              </Badge>
            ))}
            {question.standardsReference && question.standardsReference.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{question.standardsReference.length - 2}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Input field */}
        <div className="space-y-3">{renderInput()}</div>

        {/* Field mappings info */}
        {question.fieldMappings && question.fieldMappings.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="text-xs font-semibold text-green-900 mb-2">
              Will auto-populate {question.fieldMappings.length} field
              {question.fieldMappings.length > 1 ? 's' : ''}:
            </p>
            <div className="flex flex-wrap gap-2">
              {question.fieldMappings.map((mapping, idx) => (
                <span key={idx} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                  {mapping.formFieldId}
                  {mapping.confidence < 100 && ` (${mapping.confidence}% confidence)`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={answer === null || answer === undefined || answer === '' || isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Next Question'}
          </Button>
        </div>

        {/* Progress indicator */}
        {answeredQuestions > 0 && totalQuestions > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Question {answeredQuestions} of {totalQuestions}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
