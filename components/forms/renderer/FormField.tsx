'use client'

import React from 'react'
import { UseFormRegister, FieldError } from 'react-hook-form'
import { FormField as IFormField } from '@/lib/forms/form-types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface FormFieldRendererProps {
  field: IFormField
  register: UseFormRegister<any>
  error?: FieldError
  value?: any
}

/**
 * FormField - Renders individual form fields based on type
 */
export function FormFieldRenderer({
  field,
  register,
  error,
  value,
}: FormFieldRendererProps) {
  const { ref, ...registerRest } = register(field.id)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={field.id} className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      </div>

      {field.description && (
        <p className="text-xs text-gray-500">{field.description}</p>
      )}

      {/* Text field */}
      {field.type === 'text' && (
        <Input
          id={field.id}
          type="text"
          placeholder={field.placeholder}
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Email field */}
      {field.type === 'email' && (
        <Input
          id={field.id}
          type="email"
          placeholder={field.placeholder}
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Phone field */}
      {field.type === 'phone' && (
        <Input
          id={field.id}
          type="tel"
          placeholder={field.placeholder}
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Number field */}
      {field.type === 'number' && (
        <Input
          id={field.id}
          type="number"
          placeholder={field.placeholder}
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Date field */}
      {field.type === 'date' && (
        <Input
          id={field.id}
          type="date"
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* DateTime field */}
      {field.type === 'datetime' && (
        <Input
          id={field.id}
          type="datetime-local"
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Textarea field */}
      {field.type === 'textarea' && (
        <Textarea
          id={field.id}
          placeholder={field.placeholder}
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          className={error ? 'border-red-500' : ''}
          rows={4}
        />
      )}

      {/* Select field */}
      {field.type === 'select' && field.options && (
        <Select defaultValue={value} onValueChange={(val) => {
          // Update form value through register
          registerRest.onChange({ target: { value: val } })
        }}>
          <SelectTrigger disabled={field.disabled} className={error ? 'border-red-500' : ''}>
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Radio field */}
      {field.type === 'radio' && field.options && (
        <RadioGroup defaultValue={value} onValueChange={(val) => {
          registerRest.onChange({ target: { value: val } })
        }}>
          {field.options.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <RadioGroupItem value={option.value} id={`${field.id}-${option.value}`} />
              <Label htmlFor={`${field.id}-${option.value}`} className="font-normal cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {/* Checkbox field */}
      {field.type === 'checkbox' && field.options && (
        <div className="space-y-2">
          {field.options.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`${field.id}-${option.value}`}
                {...registerRest}
                value={option.value}
                ref={ref}
              />
              <Label htmlFor={`${field.id}-${option.value}`} className="font-normal cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      )}

      {/* File field */}
      {field.type === 'file' && (
        <Input
          id={field.id}
          type="file"
          disabled={field.disabled}
          {...registerRest}
          ref={ref}
          accept={field.acceptedFormats?.join(',')}
          className={error ? 'border-red-500' : ''}
        />
      )}

      {/* Signature field */}
      {field.type === 'signature' && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600">Signature field - captured separately</p>
          <input type="hidden" {...registerRest} ref={ref} />
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600">
          {error.message || `${field.label} is invalid`}
        </p>
      )}
    </div>
  )
}
