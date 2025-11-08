"use client";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type QuestionType = "text" | "textarea" | "select" | "checkbox" | "radio" | "number";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
}

interface QuestionCardProps {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  tier?: 1 | 2 | 3;
  error?: string;
}

const tierColors = {
  1: "border-red-500",
  2: "border-amber-500",
  3: "border-green-500",
};

const tierBgColors = {
  1: "bg-red-50",
  2: "bg-amber-50",
  3: "bg-green-50",
};

export function QuestionCard({ question, value, onChange, tier = 1, error }: QuestionCardProps) {
  const renderInput = () => {
    switch (question.type) {
      case "text":
      case "number":
        return (
          <Input
            type={question.type}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder}
            className={cn(error && "border-red-500")}
          />
        );

      case "textarea":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder}
            rows={4}
            className={cn(error && "border-red-500")}
          />
        );

      case "select":
        return (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className={cn(error && "border-red-500")}>
              <SelectValue placeholder={question.placeholder || "Select an option"} />
            </SelectTrigger>
            <SelectContent>
              {question.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${option}`}
                  checked={value?.includes(option) || false}
                  onCheckedChange={(checked) => {
                    const newValue = value || [];
                    if (checked) {
                      onChange([...newValue, option]);
                    } else {
                      onChange(newValue.filter((v: string) => v !== option));
                    }
                  }}
                />
                <Label htmlFor={`${question.id}-${option}`} className="text-sm font-normal">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );

      case "radio":
        return (
          <RadioGroup value={value || ""} onValueChange={onChange}>
            {question.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                <Label htmlFor={`${question.id}-${option}`} className="text-sm font-normal">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={cn("p-6 border-2", tierColors[tier], tierBgColors[tier])}>
      <div className="space-y-4">
        <div>
          <Label className="text-base font-semibold">
            {question.text}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {question.helpText && (
            <p className="text-sm text-muted-foreground mt-1">{question.helpText}</p>
          )}
        </div>
        {renderInput()}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Card>
  );
}
