import { useForm, UseFormProps, FieldValues, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';

interface UseFormWithZodOptions<TFieldValues extends FieldValues, TContext = Record<string, unknown>> 
  extends Omit<UseFormProps<TFieldValues, TContext>, 'resolver'> {
  onSubmit?: (data: TFieldValues, form: UseFormReturn<TFieldValues, TContext>) => Promise<void> | void;
}

/**
 * Custom hook combining React Hook Form with Zod validation
 * 
 * @param schema Zod schema for form validation
 * @param options Form options including submission handler
 * @returns Form methods and state for React Hook Form with Zod
 */
export function useFormWithZod<TFieldValues extends FieldValues, TContext = Record<string, unknown>>(
  schema: z.ZodType<TFieldValues, z.ZodTypeDef, TFieldValues>,
  options?: UseFormWithZodOptions<TFieldValues, TContext>
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize form with Zod resolver
  const form = useForm<TFieldValues, TContext>({
    ...options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
  });

  // Custom submit handler
  const handleSubmit = form.handleSubmit(async (data) => {
    if (options?.onSubmit) {
      setIsSubmitting(true);
      setSubmitError(null);
      
      try {
        await options.onSubmit(data, form);
      } catch (error) {
        setSubmitError(
          error instanceof Error 
            ? error.message 
            : 'An unknown error occurred'
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  });

  return {
    ...form,
    handleSubmit,
    formState: {
      ...form.formState,
      errors: form.formState.errors,
      isSubmitting,
    },
    submitError,
    clearSubmitError: () => setSubmitError(null),
  };
}
