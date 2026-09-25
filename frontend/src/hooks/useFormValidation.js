import { useState } from 'react';

/**
 * Small shared form-validation hook. Rules are intentionally data-driven so
 * forms can show field errors on blur and validate every field on submit.
 */
export function useFormValidation() {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateValue = (value, rules = {}) => {
    const messages = [];
    const label = rules.label || 'This field';
    const text = typeof value === 'string' ? value.trim() : value;
    const empty = text === '' || text === null || text === undefined;

    if (rules.required && empty) messages.push(`${label} is required`);
    if (!empty && rules.minLength && text.length < rules.minLength) {
      messages.push(`${label} must be at least ${rules.minLength} characters`);
    }
    return messages;
  };

  const validateForm = (values, rulesByField) => {
    const nextErrors = {};
    const nextTouched = {};

    Object.entries(rulesByField).forEach(([field, rules]) => {
      const fieldErrors = validateValue(values[field], rules);
      if (fieldErrors.length) nextErrors[field] = fieldErrors;
      nextTouched[field] = true;
    });

    setErrors(nextErrors);
    setTouched((current) => ({ ...current, ...nextTouched }));
    return Object.keys(nextErrors).length === 0;
  };

  const handleBlur = (field) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const clearErrors = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...remaining } = current;
      return remaining;
    });
  };

  return { errors, touched, validateForm, handleBlur, clearErrors };
}

export default useFormValidation;
